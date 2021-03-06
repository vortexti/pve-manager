/*jslint confusion: true*/
Ext.define('PVE.ceph.Install', {
    extend: 'Ext.window.Window',
    xtype: 'pveCephInstallWindow',
    mixins: ['Proxmox.Mixin.CBind'],

    width: 220,
    header: false,
    resizable: false,
    draggable: false,
    modal: true,
    nodename: undefined,
    shadow: false,
    border: false,
    bodyBorder: false,
    closable: false,
    cls: 'install-mask',
    bodyCls: 'install-mask',
    layout: {
        align: 'stretch',
        pack: 'center',
	type: 'vbox'
    },
    viewModel: {
	data: {
	      cephVersion: 'nautilus',
	      isInstalled: false
	},
	formulas: {
	    buttonText: function (get){
		if (get('isInstalled')) {
		    return gettext('Configure Ceph');
		} else {
		    return gettext('Install Ceph-') + get('cephVersion');
		}
	    },
	    windowText: function (get) {
		if (get('isInstalled')) {
		    return '<p class="install-mask">' +
		    Ext.String.format(gettext('{0} is not initialized.'), 'Ceph') + ' '+
		    gettext('You need to create a initial config once.') + '</p>';
		} else {
		    return '<p class="install-mask">' +
		    Ext.String.format(gettext('{0} is not installed on this node.'), 'Ceph') + '<br>' +
		    gettext('Would you like to install it now?') + '</p>';
		}
	    }
	}
    },
    items: [
	{
	    bind: {
		html: '{windowText}'
	    },
	    border: false,
	    padding: 5,
	    bodyCls: 'install-mask'

	},
	{
	    xtype: 'button',
	    bind: {
		text: '{buttonText}'
	    },
	    viewModel: {},
	    cbind: {
		nodename: '{nodename}'
	    },
	    handler: function() {
		var me = this.up('pveCephInstallWindow');
		var win = Ext.create('PVE.ceph.CephInstallWizard',{
		    nodename: me.nodename
		});
		win.getViewModel().set('isInstalled', this.getViewModel().get('isInstalled'));
		win.show();
		me.mon(win,'beforeClose', function(){
		    me.fireEvent("cephInstallWindowClosed");
		    me.close();
		});

	    }
	}
    ]
});
