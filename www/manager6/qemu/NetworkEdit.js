Ext.define('PVE.qemu.NetworkInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuNetworkInputPanel',
    onlineHelp: 'qm_network_device',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	me.network.model = values.model;
	if (values.nonetwork) {
	    return {};
	} else {
	    me.network.bridge = values.bridge;
	    me.network.tag = values.tag;
	    me.network.firewall = values.firewall;
	}
	me.network.macaddr = values.macaddr;
	me.network.disconnect = values.disconnect;
	me.network.queues = values.queues;

	if (values.rate) {
	    me.network.rate = values.rate;
	} else {
	    delete me.network.rate;
	}

	var params = {};

	params[me.confid] = PVE.Parser.printQemuNetwork(me.network);

	return params;
    },

    setNetwork: function(confid, data) {
	var me = this;

	me.confid = confid;

	if (data) {
	    data.networkmode = data.bridge ? 'bridge' : 'nat';
	} else {
	    data = {};
	    data.networkmode = 'bridge';
	}
	me.network = data;
	
	me.setValues(me.network);
    },

    setNodename: function(nodename) {
	var me = this;

	me.bridgesel.setNodename(nodename);
    },

    initComponent : function() {
	var me = this;

	me.network = {};
	me.confid = 'net0';

	me.column1 = [];
	me.column2 = [];

	me.bridgesel = Ext.create('PVE.form.BridgeSelector', {
	    name: 'bridge',
	    fieldLabel: gettext('Bridge'),
	    nodename: me.nodename,
	    autoSelect: true,
	    allowBlank: false
	});

	me.column1 = [
	    me.bridgesel,
	    {
		xtype: 'pveVlanField',
		name: 'tag',
		value: ''
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Firewall'),
		name: 'firewall',
		checked: (me.insideWizard || me.isCreate)
	    }
	];

	me.advancedColumn1 = [
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Disconnect'),
		name: 'disconnect'
	    }
	];

	if (me.insideWizard) {
	    me.column1.unshift({
		xtype: 'checkbox',
		name: 'nonetwork',
		inputValue: 'none',
		boxLabel: gettext('No network device'),
		listeners: {
		    change: function(cb, value) {
			var fields = [
			    'disconnect',
			    'bridge',
			    'tag',
			    'firewall',
			    'model',
			    'macaddr',
			    'rate',
			    'queues'
			];
			fields.forEach(function(fieldname) {
			    me.down('field[name='+fieldname+']').setDisabled(value);
			});
			me.down('field[name=bridge]').validate();
		    }
		}
	    });
	    me.column2.unshift({
		xtype: 'displayfield'
	    });
	}

	me.column2.push(
	    {
		xtype: 'pveNetworkCardSelector',
		name: 'model',
		fieldLabel: gettext('Model'),
		value: PVE.qemu.OSDefaults.generic.networkCard,
		allowBlank: false
	    },
	    {
		xtype: 'textfield',
		name: 'macaddr',
		fieldLabel: gettext('MAC address'),
		vtype: 'MacAddress',
		allowBlank: true,
		emptyText: 'auto'
	    });
	me.advancedColumn2 = [
	    {
		xtype: 'numberfield',
		name: 'rate',
		fieldLabel: gettext('Rate limit') + ' (MB/s)',
		minValue: 0,
		maxValue: 10*1024,
		value: '',
		emptyText: 'unlimited',
		allowBlank: true
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'queues',
		fieldLabel: 'Multiqueue',
		minValue: 1,
		maxValue: 8,
		value: '',
		allowBlank: true
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.NetworkEdit', {
    extend: 'Proxmox.window.Edit',

    isAdd: true,

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";	    
	}

	me.isCreate = me.confid ? false : true;

	var ipanel = Ext.create('PVE.qemu.NetworkInputPanel', {
	    confid: me.confid,
	    nodename: nodename,
	    isCreate: me.isCreate
	});

	Ext.applyIf(me, {
	    subject: gettext('Network Device'),
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var i, confid;
		me.vmconfig = response.result.data;
		if (!me.isCreate) {
		    var value = me.vmconfig[me.confid];
		    var network = PVE.Parser.parseQemuNetwork(me.confid, value);
		    if (!network) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse network options');
			me.close();
			return;
		    }
		    ipanel.setNetwork(me.confid, network);
		} else {
		    for (i = 0; i < 100; i++) {
			confid = 'net' + i.toString();
			if (!Ext.isDefined(me.vmconfig[confid])) {
			    me.confid = confid;
			    break;
			}
		    }
		    ipanel.setNetwork(me.confid);		    
		}
	    }
	});
    }
});
