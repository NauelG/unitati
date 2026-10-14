/**
 * The projects domain's public surface (ADR 0002): routes validate input, call
 * one of these and map the outcome to HTTP. No route builds a query.
 *
 * **Two kinds of check, split on purpose.** Whether a user may reach a screen is
 * a capability, gated by `requirePermission` in the route (ADR 0007). Which rows
 * they then see is data, and lives here: every read starts from
 * `requireProjectScope` / `requireTaskScope`. Every write requires
 * `projects.manage` and refuses an archived project.
 *
 * **The state catalogue is the organisation's; the group is the product's.**
 * Code may depend on a state's `group`, never on its name.
 */

export {
	states,
	projects,
	tasks,
	taskAssignees,
	stateGroup,
	projectCodeSequence,
	taskCodeSequence
} from './schema';
export type { State, Project, Task, TaskAssignee } from './schema';

export { requireProjectScope, requireTaskScope } from './scope';
export { requireProjectRead, requireProjectWrite } from './guards';
export { fieldsOf, firstField, orNull, rejected } from './forms';
export { readBoardPreference } from './board-preference';
export type { Fields } from './forms';

export {
	listStates,
	listStatesWithTaskCount,
	defaultTaskState,
	createState,
	renameState,
	reorderState,
	deleteState
} from './states';
export type {
	StateWithTaskCount,
	CreateStateFailure,
	RenameStateFailure,
	DeleteStateFailure
} from './states';

export { ensureDefaultStates, DEFAULT_STATES } from './defaults';

export {
	listProjects,
	countActiveProjects,
	getProject,
	projectProgress,
	projectProgressMany,
	createProject,
	updateProject,
	archiveProject,
	unarchiveProject
} from './projects';
export type {
	ProjectView,
	ProjectListRequest,
	ProjectProgress,
	CreateProjectFailure,
	UpdateProjectFailure
} from './projects';

export {
	listTasks,
	countOpenTasks,
	myOpenTasks,
	OPEN_TASK_GROUPS,
	getTask,
	createTask,
	updateTask,
	assign,
	unassign,
	setAssignees,
	moveTask
} from './tasks';
export type {
	TaskView,
	TaskAssigneeView,
	TaskListRequest,
	MoveNeighbours,
	CreateTaskFailure,
	UpdateTaskFailure,
	AssignFailure,
	MoveTaskFailure
} from './tasks';

export { placeBetween, spread, MIN_GAP, STEP } from './position';

export {
	createProjectInput,
	updateProjectInput,
	createTaskInput,
	updateTaskInput,
	createStateInput,
	updateStateInput,
	RESERVED_PROJECT_TAGS,
	RESERVED_TASK_TAGS
} from './validation';
export type {
	CreateProjectInput,
	UpdateProjectInput,
	CreateTaskInput,
	UpdateTaskInput,
	CreateStateInput,
	UpdateStateInput
} from './validation';
