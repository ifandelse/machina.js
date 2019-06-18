import {
  BehavioralFsm,
  BehavioralFsmInstance,
  StateTransitions,
  BehavioralFsmHandler
}  from 'machina';

type SignalStates = 'uninitialized'
  | 'green'
  | 'green-interruptible'
  | 'yellow'
  | 'red';

interface LightInstance extends BehavioralFsmInstance<SignalStates> {
  location: string;
  direction: string;
  timer?: number;
}

const states: StateTransitions<LightInstance, SignalStates> = {
  uninitialized: {
    '*': function(client) {
      this.deferUntilTransition(client);
      this.transition(client, 'green');
    }
  },

  green: {
    _onEnter: function(client) {
      client.timer = setTimeout(() => {
          this.handle(client, 'timeout');
      }, 30000);

      this.emit('vehicles', { client: client, status: 'green' });
    },

    timeout: 'green-interruptible',

    pedestrianWaiting: function(client) {
      this.deferUntilTransition(client, 'green-interruptible');
    },

    _onExit: function(client) {
      clearTimeout(client.timer);
    }
  },

  'green-interruptible': {
    pedestrianWaiting: 'yellow'
  },

  yellow: {
    _onEnter: function(client) {
      client.timer = setTimeout(() => {
        this.handle(client, 'timeout');
      }, 5000);

      this.emit('vehicles', { client: client, status: 'yellow' });
  },

    timeout: 'red',

    _onExit: function(client) {
      clearTimeout(client.timer);
    }
  },

  red: {
    _onEnter: function(client) {
      client.timer = setTimeout(() => {
        this.handle(client, 'timeout');
      }, 1000);
    },

    _reset: 'green',

    _onExit: function(client) {
      clearTimeout(client.timer);
    }
  }
}

interface Handlers {
  reset: BehavioralFsmHandler<LightInstance, SignalStates>;
  pedestrianWaiting: BehavioralFsmHandler<LightInstance, SignalStates>;
}

const handlers: Handlers = {
  reset: function(client) {
    this.handle(client, '_reset');
  },

  pedestrianWaiting: function(client) {
    this.handle(client, 'pedestrianWaiting');
  }
}

type VehicleSignalFsm = Handlers & BehavioralFsm<LightInstance, SignalStates>;

const vehicleSignal = new BehavioralFsm<LightInstance, SignalStates>({
  initialize: function(options: object) {
    for (const key in options) {
      console.log(key);
    }
  },

  namespace: 'vehicle-signal',
  initialState: 'unitialized',
  states,

  ...handlers
}) as VehicleSignalFsm;

const light1: LightInstance = { location: 'Dijsktra Ave & Hunt Blvd', direction: 'north-south' };
const light2: LightInstance = { location: 'Dijsktra Ave & Hunt Blvd', direction: 'east-west' };

vehicleSignal.pedestrianWaiting(light1);
vehicleSignal.pedestrianWaiting(light2);
