const EventEmitter = require('events');

const tasks = {};
const taskEvents = new EventEmitter();

module.exports = {
  detectAndRunEntryTask,
  createTask,
  composeSeries,
  composeParallel,
};

const { setupTaskDisplay } = require('./display');

function detectAndRunEntryTask() {
  // get requested task name and execute
  const taskName = process.argv[2];
  if (!taskName) {
    throw new Error(`ecf-wallet build: No task name specified`);
  }
  runTask(taskName);
}

async function runTask(taskName) {
  if (!Reflect.has(tasks, taskName)) {
    throw new Error(`ecf-wallet build: Unrecognized task name "${taskName}"`);
  }
  setupTaskDisplay(taskEvents);
  console.log(`running task "${taskName}"...`);
  try {
    await tasks[taskName]();
  } catch (err) {
    console.error(
      `ecf-wallet build: Encountered an error while running task "${taskName}".`,
    );
    console.error(err);
    process.exit(1);
  }
  taskEvents.emit('complete');
}

function createTask(taskName, taskFn) {
  if (Reflect.has(tasks, taskName)) {
    throw new Error(
      `ecf-wallet build: task "${taskName}" already exists. Refusing to redefine`,
    );
  }
  const task = instrumentForTaskStats(taskName, taskFn);
  task.taskName = taskName;
  tasks[taskName] = task;
  return task;
}

function instrumentForTaskStats(taskName, asyncFn) {
  return async () => {
    const start = Date.now();
    taskEvents.emit('start', [taskName, start]);
    await asyncFn();
    const end = Date.now();
    taskEvents.emit('end', [taskName, start, end]);
  };
}

function composeSeries(...subtasks) {
  return async () => {
    for (const subtask of subtasks) {
      await subtask();
    }
  };
}

function composeParallel(...subtasks) {
  return async () => {
    await Promise.all(subtasks.map((subtask) => subtask()));
  };
}
