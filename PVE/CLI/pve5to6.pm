package PVE::CLI::pve5to6;

use strict;
use warnings;

use PVE::API2::APT;
use PVE::API2::Ceph;
use PVE::API2::LXC;
use PVE::API2::Qemu;

use PVE::Ceph::Tools;
use PVE::Cluster;
use PVE::Corosync;
use PVE::INotify;
use PVE::JSONSchema;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Tools;

use PVE::CLIHandler;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

my $min_pve_rel = '5.4';
my $min_pve_pkgrel = 2;

my $counters = {
    pass => 0,
    skip => 0,
    warn => 0,
    fail => 0,
};

my $log_line = sub {
    my ($level, $line) = @_;

    $counters->{$level}++ if defined($level) && defined($counters->{$level});

    print uc($level), ': ' if defined($level);
    print "$line\n";
};

sub log_pass {
    $log_line->('pass', @_);
}

sub log_info {
    $log_line->('info', @_);
}
sub log_skip {
    $log_line->('skip', @_);
}
sub log_warn {
    $log_line->('warn', @_);
}
sub log_fail {
    $log_line->('fail', @_);
}

my $get_pkg = sub {
    my ($pkg) = @_;

    my $versions = eval { PVE::API2::APT->versions({ node => $nodename }); };

    if (!defined($versions)) {
	my $msg = "unable to retrieve package version information";
	$msg .= "- $@" if $@;
	log_fail("$msg");
	return undef;
    }

    my $pkgs = [ grep { $_->{Package} eq $pkg } @$versions ];
    if (!defined $pkgs || $pkgs == 0) {
	log_fail("unable to determine installed $pkg version.");
	return undef;
    } else {
	return $pkgs->[0];
    }
};

sub check_pve_packages {
    print "CHECKING VERSION INFORMATION FOR PVE PACKAGES\n";

    print "\nChecking for package updates..\n";
    my $updates = eval { PVE::API2::APT->list_updates({ node => $nodename }); };
    if (!defined($updates)) {
	log_warn("$@") if $@;
	log_fail("unable to retrieve list of package updates!");
    } elsif (@$updates > 0) {
	my $pkgs = join(', ', map { $_->{Package} } @$updates);
	log_warn("updates for the following packages are available: $pkgs");
    } else {
	log_pass("all packages uptodate");
    }

    print "\nChecking proxmox-ve package version..\n";
    if (defined(my $proxmox_ve = $get_pkg->('proxmox-ve'))) {
	my $min_pve_ver = "$min_pve_rel-$min_pve_pkgrel";

	if ($proxmox_ve->{OldVersion} =~ m/^$min_pve_rel-(\d+)/ && $1 >= $min_pve_pkgrel) {
	    log_pass("proxmox-ve package has version >= $min_pve_ver");
	} else {
	    log_fail("proxmox-ve package is too old, please upgrade to >= $min_pve_ver!");
	}
    }
}

sub check_storage_health {
    print "\nCHECKING CONFIGURED STORAGES\n\n";
    my $cfg = PVE::Storage::config();

    my $ctime = time();

    my $info = PVE::Storage::storage_info($cfg);

    foreach my $storeid (keys %$info) {
	my $d = $info->{$storeid};
	if ($d->{enabled}) {
	    if ($d->{active}) {
		log_pass("storage '$storeid' enabled and active.");
	    } else {
		log_warn("storage '$storeid' enabled but not active!");
	    }
	} else {
	    log_skip("storage '$storeid' disabled.");
	}
    }
}

sub check_cluster_corosync {
    print "\nCHECKING CLUSTER HEALTH/SETTINGS\n\n";

    if (!PVE::Corosync::check_conf_exists(1)) {
	log_skip("standalone node.");
	return;
    }

    if (PVE::Cluster::check_cfs_quorum(1)) {
	log_pass("Cluster is quorate.");
    } else {
	log_fail("Cluster lost quorum!");
    }

    my $conf = PVE::Cluster::cfs_read_file('corosync.conf');
    my $conf_nodelist = PVE::Corosync::nodelist($conf);

    if (!defined($conf_nodelist)) {
	log_fail("unable to retrieve nodelist from corosync.conf");
    } elsif (grep { $conf_nodelist->{$_}->{quorum_votes} != 1 } keys %$conf_nodelist) {
	log_warn("non-default quorum_votes distribution detected!");
    }

    my $cfs_nodelist = PVE::Cluster::get_clinfo()->{nodelist};
    my $offline_nodes = grep { $cfs_nodelist->{$_}->{online} != 1 } keys %$cfs_nodelist;
    if ($offline_nodes > 0) {
	log_fail("$offline_nodes nodes are offline!");
    }

    my $conf_nodelist_count = scalar(keys %$conf_nodelist);
    my $cfs_nodelist_count = scalar(keys %$cfs_nodelist);
    log_warn("cluster consists of less than three nodes!")
	if $conf_nodelist_count < 3;

    log_fail("corosync.conf ($conf_nodelist_count) and pmxcfs ($cfs_nodelist_count) don't agree about size of nodelist.")
	if $conf_nodelist_count != $cfs_nodelist_count;

    foreach my $cs_node (keys %$conf_nodelist) {
	my $entry = $conf_nodelist->{$cs_node};
	log_fail("No name entry for node '$cs_node' in corosync.conf.")
	    if !defined($entry->{name});
	log_fail("No nodeid configured for node '$cs_node' in corosync.conf.")
	    if !defined($entry->{nodeid});

	my $verify_ring_ip = sub {
	    my $key = shift;
	    my $ring = $entry->{$key};
	    if (defined($ring) && !PVE::JSONSchema::pve_verify_ip($ring, 1)) {
		log_fail("$key '$ring' of node '$cs_node' is not an IP address, consider replacing it with the currently resolved IP address.");
	    }
	};
	$verify_ring_ip->('ring0_addr');
	$verify_ring_ip->('ring1_addr');
    }

    my $totem = $conf->{main}->{totem};

    my $transport = $totem->{transport};
    if (defined($transport)) {
	log_fail("Corosync transport expliclitly set to '$transport' instead of implicit default!");
    }

    if ((!defined($totem->{secauth}) || $totem->{secauth} ne 'on') && (!defined($totem->{crypto_cipher}) || $totem->{crypto_cipher} eq 'none')) {
	log_fail("Corosync authentication/encryption is not explicitly enabled (secauth / crypto_cipher / crypto_hash)!");
    }

    if (defined($totem->{crypto_cipher}) && $totem->{crypto_cipher} eq '3des') {
	log_fail("Corosync encryption cipher set to '3des', no longer supported in Corosync 3.x!");
    }

    my $prefix_info = sub { my $line = shift; log_info("$line"); };
    eval {
	print "\n";
	log_info("Printing detailed cluster status..");
	PVE::Tools::run_command(['corosync-quorumtool', '-siH'], outfunc => $prefix_info, errfunc => $prefix_info);
    };

    print "\nCHECKING INSTALLED COROSYNC VERSION\n\n";
    if (defined(my $corosync = $get_pkg->('corosync'))) {
	if ($corosync->{OldVersion} =~ m/^2\./) {
	    log_fail("corosync 2.x installed, cluster-wide upgrade to 3.x needed!");
	} elsif ($corosync->{OldVersion} =~ m/^3\./) {
	    log_pass("corosync 3.x installed.");
	} else {
	    log_fail("unexpected corosync version installed: $corosync->{OldVersion}!");
	}
    }
}

sub check_ceph {
    print "\nCHECKING HYPER-CONVERGED CEPH STATUS\n\n";

    if (PVE::Ceph::Tools::check_ceph_inited(1)) {
	log_info("hyper-converged ceph setup detected!");
    } else {
	log_skip("no hyper-converged ceph setup detected!");
	return;
    }

    log_info("getting Ceph status/health information..");
    my $ceph_status = eval { PVE::API2::Ceph->status({ node => $nodename }); };
    my $osd_flags = eval { PVE::API2::Ceph->get_flags({ node => $nodename }); };
    my $noout = $osd_flags =~ m/noout/;

    if (!$ceph_status || !$ceph_status->{health}) {
	log_fail("unable to determine Ceph status!");
    } else {
	my $ceph_health = $ceph_status->{health}->{status};
	if (!$ceph_health) {
	    log_fail("unable to determine Ceph health!");
	} elsif ($ceph_health eq 'HEALTH_OK') {
	    log_pass("Ceph health reported as 'HEALTH_OK'.");
	} elsif ($ceph_health eq 'HEALTH_WARN' && $noout && (keys %{$ceph_status->{health}->{checks}} == 1)) {
		log_pass("Ceph health reported as 'HEALTH_WARN' with a single failing check and 'noout' flag set.");
	} else {
		log_warn("Ceph health reported as '$ceph_health'");
	}
    }

    log_info("getting Ceph OSD flags..");
    eval {
	if (!$osd_flags) {
	    log_fail("unable to get Ceph OSD flags!");
	} else {
	    if ($osd_flags =~ m/recovery_deletes/ && $osd_flags =~ m/purged_snapdirs/) {
		log_pass("all PGs have been scrubbed at least once while running Ceph Luminous.");
	    } else {
		log_fail("missing 'recovery_deletes' and/or 'purged_snapdirs' flag, scrub of all PGs required before upgrading to Nautilus!");
	    }
	    if ($noout) {
		log_pass("noout flag set to prevent rebalancing during cluster-wide upgrades.");
	    }  else {
		log_warn("noout flag not set - recommended to prevent rebalancing during upgrades.");
	    }
	}
    };

    log_info("getting Ceph daemon versions..");
    my $ceph_versions = eval { PVE::Ceph::Tools::get_cluster_versions(undef, 1); };
    if (!$ceph_versions) {
	log_fail("unable to determine Ceph daemon versions!");
    } else {
	my $services = [
	    { 'key' => 'mon', 'name' => 'monitor' },
	    { 'key' => 'mgr', 'name' => 'manager' },
	    { 'key' => 'mds', 'name' => 'MDS' },
	    { 'key' => 'osd', 'name' => 'OSD' },
	];

	foreach my $service (@$services) {
	    my $name = $service->{name};
	    if (my $service_versions = $ceph_versions->{$service->{key}}) {
		if (keys %$service_versions == 0) {
		    log_skip("no running instances detected for daemon type $name.");
		} elsif (keys %$service_versions == 1) {
		    log_pass("single running version detected for daemon type $name.");
		} else {
		    log_warn("multiple running versions detected for daemon type $name!");
		}
	    } else {
		log_skip("unable to determine versions of running Ceph $name instances.");
	    }
	}

	my $overall_versions = $ceph_versions->{overall};
	if (!$overall_versions) {
	    log_warn("unable to determine overall Ceph daemon versions!");
	} elsif (keys %$overall_versions == 1) {
	    log_pass("single running overall version detected for all Ceph daemon types.");
	} else {
	    log_warn("overall version mismatch detected, check 'ceph versions' output for details!");
	}
    }
}

sub check_misc {
    print "\nMISCELLANEOUS CHECKS\n\n";
    my $ssh_config = eval { PVE::Tools::file_get_contents('/root/.ssh/config') };
    log_fail("Unsupported SSH Cipher configured for root in /root/.ssh/config: $1")
	if $ssh_config =~ /^Ciphers .*(blowfish|arcfour|3des).*$/m;

    my $root_free = PVE::Tools::df('/', 10);
    log_warn("Less than 2G free space on root file system.")
	if defined($root_free) && $root_free->{avail} < 2*1024*1024*1024;

    my $running_guests = 0;
    my $vms = eval { PVE::API2::Qemu->vmlist({ node => $nodename }) };
    log_warn("Failed to retrieve information about this node's VMs - $@") if $@;
    $running_guests += grep { $_->{status} eq 'running' } @$vms
	if defined($vms);
    my $cts = eval { PVE::API2::LXC->vmlist({ node => $nodename }) };
    log_warn("Failed to retrieve information about this node's CTs - $@") if $@;
    $running_guests += grep { $_->{status} eq 'running' } @$cts
	if defined($cts);
    log_warn("$running_guests running guests detected - consider migrating/stopping them.")
	if $running_guests > 0;
}

__PACKAGE__->register_method ({
    name => 'checklist',
    path => 'checklist',
    method => 'GET',
    description => 'Check (pre-/post-)upgrade conditions.',
    parameters => {
	additionalProperties => 0,
	properties => {
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	check_pve_packages();
	check_cluster_corosync();
	check_ceph();
	check_storage_health();
	check_misc();

	print "\n\nSUMMARY:\n";
	print "PASSED: $counters->{pass}\n";
	print "SKIPPED: $counters->{skip}\n";
	print "WARNINGS: $counters->{warn}\n";
	print "FAILURES: $counters->{fail}\n";

	print "\nATTENTION: Please check the output for detailed information!\n"
	    if ($counters->{warn} > 0 || $counters->{fail} > 0);

	return undef;
    }});

our $cmddef = {
    checklist => [ __PACKAGE__, 'checklist', [], {}],
};

1;