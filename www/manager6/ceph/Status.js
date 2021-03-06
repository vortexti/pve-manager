Ext.define('PVE.node.CephStatus', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephStatus',

    onlineHelp: 'chapter_pveceph',

    scrollable: true,

    bodyPadding: 5,

    layout: {
	type: 'column'
    },

    defaults: {
	padding: 5
    },

    items: [
	{
	    xtype: 'panel',
	    title: gettext('Health'),
	    bodyPadding: 10,
	    plugins: 'responsive',
	    responsiveConfig: {
		'width < 1900': {
		    minHeight: 230,
		    columnWidth: 1
		},
		'width >= 1900': {
		    minHeight: 500,
		    columnWidth: 0.5
		}
	    },
	    layout: {
		type: 'hbox',
		align: 'stretch'
	    },
	    items: [
		{
		    xtype: 'container',
		    layout: {
			type: 'vbox',
			align: 'stretch',
		    },
		    flex: 1,
		    items: [
			{
			    flex: 1,
			    itemId: 'overallhealth',
			    xtype: 'pveHealthWidget',
			    title: gettext('Status')
			},
			{
			    itemId: 'versioninfo',
			    xtype: 'displayfield',
			    fieldLabel: gettext('Ceph Version'),
			    value: "",
			    autoEl: {
				tag: 'div',
				'data-qtip': gettext('The newest version installed in the Cluster.'),
			    },
			    padding: '10 0 0 0',
			    style: {
				'text-align': 'center',
			    },
			}
		    ],
		},
		{
		    flex: 2,
		    itemId: 'warnings',
		    stateful: true,
		    stateId: 'ceph-status-warnings',
		    xtype: 'grid',
		    // since we load the store manually to show the emptytext,
		    // we have to specify an empty one here
		    store: {
			data: [],
		    },
		    emptyText: gettext('No Warnings/Errors'),
		    columns: [
			{
			    dataIndex: 'severity',
			    header: gettext('Severity'),
			    align: 'center',
			    width: 70,
			    renderer: function(value) {
				var health = PVE.Utils.map_ceph_health[value];
				var classes = PVE.Utils.get_health_icon(health);

				return '<i class="fa fa-fw ' + classes + '"></i>';
			    },
			    sorter: {
				sorterFn: function(a,b) {
				    var healthArr = ['HEALTH_ERR', 'HEALTH_WARN', 'HEALTH_OK'];
				    return healthArr.indexOf(b.data.severity) - healthArr.indexOf(a.data.severity);
				}
			    }
			},
			{
			    dataIndex: 'summary',
			    header: gettext('Summary'),
			    flex: 1
			},
			{
			    xtype: 'actioncolumn',
			    width: 40,
			    align: 'center',
			    tooltip: gettext('Detail'),
			    items: [
				{
				    iconCls: 'x-fa fa-info-circle',
				    handler: function(grid, rowindex, colindex, item, e, record) {
					var win = Ext.create('Ext.window.Window', {
					    title: gettext('Detail'),
					    resizable: true,
					    modal: true,
					    width: 650,
					    height: 400,
					    layout: {
						type: 'fit'
					    },
					    items: [{
						scrollable: true,
						padding: 10,
						xtype: 'box',
						html: [
						    '<span>' + Ext.htmlEncode(record.data.summary) + '</span>',
						    '<pre>' + Ext.htmlEncode(record.data.detail) + '</pre>'
						]
					    }]
					});
					win.show();
				    }
				}
			    ]
			}
		    ]
		}
	    ]
	},
	{
	    xtype: 'pveCephStatusDetail',
	    itemId: 'statusdetail',
	    plugins: 'responsive',
	    responsiveConfig: {
		'width < 1900': {
		    columnWidth: 1,
		    minHeight: 250
		},
		'width >= 1900': {
		    columnWidth: 0.5,
		    minHeight: 300
		}
	    },
	    title: gettext('Status')
	},
	{
	    title: gettext('Services'),
	    xtype: 'pveCephServices',
	    itemId: 'services',
	    plugins: 'responsive',
	    layout: {
		type: 'hbox',
		align: 'stretch'
	    },
	    responsiveConfig: {
		'width < 1900': {
		    columnWidth: 1,
		    minHeight: 200
		},
		'width >= 1900': {
		    columnWidth: 0.5,
		    minHeight: 200
		}
	    }
	},
	{
	    xtype: 'panel',
	    title: gettext('Performance'),
	    columnWidth: 1,
	    bodyPadding: 5,
	    layout: {
		type: 'hbox',
		align: 'center'
	    },
	    items: [
		{
		    flex: 1,
		    xtype: 'proxmoxGauge',
		    itemId: 'space',
		    title: gettext('Usage')
		},
		{
		    flex: 2,
		    xtype: 'container',
		    defaults: {
			padding: 0,
			height: 100
		    },
		    items: [
			{
			    itemId: 'reads',
			    xtype: 'pveRunningChart',
			    title: gettext('Reads'),
			    renderer: PVE.Utils.render_bandwidth
			},
			{
			    itemId: 'writes',
			    xtype: 'pveRunningChart',
			    title: gettext('Writes'),
			    renderer: PVE.Utils.render_bandwidth
			},
			{
			    itemId: 'iops',
			    xtype: 'pveRunningChart',
			    hidden: true,
			    title: 'IOPS', // do not localize
			    renderer: Ext.util.Format.numberRenderer('0,000')
			},
			{
			    itemId: 'readiops',
			    xtype: 'pveRunningChart',
			    hidden: true,
			    title: 'IOPS: ' + gettext('Reads'),
			    renderer: Ext.util.Format.numberRenderer('0,000')
			},
			{
			    itemId: 'writeiops',
			    xtype: 'pveRunningChart',
			    hidden: true,
			    title: 'IOPS: ' + gettext('Writes'),
			    renderer: Ext.util.Format.numberRenderer('0,000')
			}
		    ]
		}
	    ]
	}
    ],

    generateCheckData: function(health) {
	var result = [];
	var checks = health.checks || {};
	var keys = Ext.Object.getKeys(checks).sort();

	Ext.Array.forEach(keys, function(key) {
	    var details = checks[key].detail || [];
	    result.push({
		id: key,
		summary: checks[key].summary.message,
		detail: Ext.Array.reduce(
			    checks[key].detail,
			    function(first, second) {
				return first + '\n' + second.message;
			    },
			    ''
			),
		severity: checks[key].severity
	    });
	});

	return result;
    },

    updateAll: function(store, records, success) {
	if (!success || records.length === 0) {
	    return;
	}

	var me = this;
	var rec = records[0];
	me.status = rec.data;

	// add health panel
	me.down('#overallhealth').updateHealth(PVE.Utils.render_ceph_health(rec.data.health || {}));
	// add errors to gridstore
	me.down('#warnings').getStore().loadRawData(me.generateCheckData(rec.data.health || {}), false);

	// update services
	me.getComponent('services').updateAll(me.metadata || {}, rec.data);

	// update detailstatus panel
	me.getComponent('statusdetail').updateAll(me.metadata || {}, rec.data);

	// add performance data
	var used = rec.data.pgmap.bytes_used;
	var total = rec.data.pgmap.bytes_total;

	var text = Ext.String.format(gettext('{0} of {1}'),
	    PVE.Utils.render_size(used),
	    PVE.Utils.render_size(total)
	);

	// update the usage widget
	me.down('#space').updateValue(used/total, text);

	// TODO: logic for jewel (iops split in read/write)

	var iops = rec.data.pgmap.op_per_sec;
	var readiops = rec.data.pgmap.read_op_per_sec;
	var writeiops = rec.data.pgmap.write_op_per_sec;
	var reads = rec.data.pgmap.read_bytes_sec || 0;
	var writes = rec.data.pgmap.write_bytes_sec || 0;

	if (iops !== undefined && me.version !== 'hammer') {
	    me.change_version('hammer');
	} else if((readiops !== undefined || writeiops !== undefined) && me.version !== 'jewel') {
	    me.change_version('jewel');
	}
	// update the graphs
	me.reads.addDataPoint(reads);
	me.writes.addDataPoint(writes);
	me.iops.addDataPoint(iops);
	me.readiops.addDataPoint(readiops);
	me.writeiops.addDataPoint(writeiops);
    },

    change_version: function(version) {
	var me = this;
	me.version = version;
	me.sp.set('ceph-version', version);
	me.iops.setVisible(version === 'hammer');
	me.readiops.setVisible(version === 'jewel');
	me.writeiops.setVisible(version === 'jewel');
    },

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;

	me.callParent();
	var baseurl = '/api2/json' + (nodename ? '/nodes/' + nodename : '/cluster') + '/ceph';
	me.store = Ext.create('Proxmox.data.UpdateStore', {
	    storeid: 'ceph-status-' + (nodename || 'cluster'),
	    interval: 5000,
	    proxy: {
		type: 'proxmox',
		url: baseurl + '/status'
	    }
	});

	me.metadatastore = Ext.create('Proxmox.data.UpdateStore', {
	    storeid: 'ceph-metadata-' + (nodename || 'cluster'),
	    interval: 15*1000,
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/cluster/ceph/metadata'
	    }
	});

	// save references for the updatefunction
	me.iops = me.down('#iops');
	me.readiops = me.down('#readiops');
	me.writeiops = me.down('#writeiops');
	me.reads = me.down('#reads');
	me.writes = me.down('#writes');

	// get ceph version
	me.sp = Ext.state.Manager.getProvider();
	me.version = me.sp.get('ceph-version');
	me.change_version(me.version);

	var regex = new RegExp("not (installed|initialized)", "i");
	PVE.Utils.handleStoreErrorOrMask(me, me.store, regex, function(me, error){
	    me.store.stopUpdate();
	    PVE.Utils.showCephInstallOrMask(me, error.statusText, (nodename || 'localhost'),
		function(win){
		    me.mon(win, 'cephInstallWindowClosed', function(){
			me.store.startUpdate();
		    });
		}
	    );
	});

	me.mon(me.store, 'load', me.updateAll, me);
	me.mon(me.metadatastore, 'load', function(store, records, success) {
	    if (!success || records.length < 1) {
		return;
	    }
	    var rec = records[0];
	    me.metadata = rec.data;

	    // update services
	    me.getComponent('services').updateAll(rec.data, me.status || {});

	    // update detailstatus panel
	    me.getComponent('statusdetail').updateAll(rec.data, me.status || {});

	    let maxversion = [];
	    let maxversiontext = "";
	    for (const [nodename, data] of Object.entries(me.metadata.node)) {
		let version = data.version.parts;
		if (PVE.Utils.compare_ceph_versions(version, maxversion) > 0) {
		    maxversion = version;
		    maxversiontext = data.version.str;
		}
	    }
	    me.down('#versioninfo').setValue(maxversiontext);
	}, me);

	me.on('destroy', me.store.stopUpdate);
	me.on('destroy', me.metadatastore.stopUpdate);
	me.store.startUpdate();
	me.metadatastore.startUpdate();
    }

});
