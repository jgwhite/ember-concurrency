import Ember from 'ember';
import {
  enqueueTasksPolicy,
  dropQueuedTasksPolicy,
  cancelOngoingTasksPolicy,
  dropButKeepLatestPolicy
} from './-buffer-policy';

import Scheduler from './-scheduler';

// this is mixed into TaskProperties and TaskGroup properties, i.e.
// the Computed Propertys that ultimately produce Tasks and TaskGroups.
// Hence they both have all the task modifiers like enqueue/restartable.
export const taskModifiers = {
  // default _bufferPolicy is arbitrary when maxConcurrency is infinity;
  // enqueue/drop/restartable all behave the same when there's no concurrency limit
  _bufferPolicy: enqueueTasksPolicy,
  _maxConcurrency: Infinity,
  _taskGroupPath: null,
  _hasUsedModifier: false,
  _hasSetBufferPolicy: false,

  restartable() {
    return setBufferPolicy(this, cancelOngoingTasksPolicy);
  },

  enqueue() {
    return setBufferPolicy(this, enqueueTasksPolicy);
  },

  drop() {
    return setBufferPolicy(this, dropQueuedTasksPolicy);
  },

  keepLatest() {
    return setBufferPolicy(this, dropButKeepLatestPolicy);
  },

  maxConcurrency(n) {
    this._hasUsedModifier = true;
    this._maxConcurrency = n;
    assertModifiersNotMixedWithGroup(this);
    return this;
  },

  group(taskGroupPath) {
    this._taskGroupPath = taskGroupPath;
    assertModifiersNotMixedWithGroup(this);
    return this;
  },

  _sharedConstructor(taskFn) {
    let tp = this;
    tp.taskFn = taskFn;
    Ember.ComputedProperty.call(this, function(_propertyName) {
      return tp._createTask(this, _propertyName);
    });
  },

  _createTask(context, _propertyName) {
    let _taskState = getInitialTaskState();

    return this._TaskConstructor.create({
      fn: this.taskFn,
      context,
      _origin: context,
      _taskGroupPath: this._taskGroupPath,
      _propertyName,
      _debugCallback: this._debugCallback,
      _scheduler: makeScheduler(this, context, _taskState),
      _taskState,
    });
  },

  _TaskConstructor: null,
};

function makeScheduler(taskProperty, context, _taskState) {
  let taskGroupPath = taskProperty._taskGroupPath;
  if (taskGroupPath) {
    let taskGroup = context.get(taskGroupPath);
    Ember.assert(`Expected path '${taskGroupPath}' to resolve to a TaskGroup object, but instead was ${taskGroup}`, taskGroup._isTaskGroup);
    return taskGroup._scheduler;
  } else {
    return Scheduler.create({
      bufferPolicy: taskProperty._bufferPolicy,
      maxConcurrency: taskProperty._maxConcurrency,
      _taskState,
    });
  }
}

function getInitialTaskState() {
  return {
    lastPerformed:  null,
    lastStarted:    null,
    lastRunning:    null,
    lastSuccessful: null,
    lastComplete:   null,
    lastErrored:    null,
    lastCanceled:   null,
    lastIncomplete: null,
  };
}

function setBufferPolicy(obj, policy) {
  obj._hasSetBufferPolicy = true;
  obj._hasUsedModifier = true;
  obj._bufferPolicy = policy;
  assertModifiersNotMixedWithGroup(obj);

  if (obj._maxConcurrency === Infinity) {
    obj._maxConcurrency = 1;
  }

  return obj;
}

function assertModifiersNotMixedWithGroup(obj) {
  Ember.assert(`ember-concurrency does not currently support using both .group() with other task modifiers (e.g. drop(), enqueue(), restartable())`, !obj._hasUsedModifier || !obj._taskGroupPath);
}
