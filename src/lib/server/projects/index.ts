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

export type { State, Project, Task, TaskAssignee, Milestone } from './schema';

export { requireProjectScope, requireTaskScope, seesAllProjects } from './scope';
export { findTaskInScope, findProjectInScope, taskSnapshot, projectSnapshot } from './link-targets';
export type { TaskLinkTarget, ProjectLinkTarget } from './link-targets';
export { redactWorkEntries } from './work-entries';
export { taskSummaries, tasksOfProject, projectSummaries, readsProjects } from './summaries';
export type { TaskSummary, ProjectSummary } from './summaries';
export { requireProjectRead, requireProjectWrite } from './guards';
export { fieldsOf, firstField, orNull, rejected, readAttachmentForm } from './forms';
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
	openProject,
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
	setProjectVisibility,
	addProjectMember,
	removeProjectMember,
	listProjectMembers,
	canManageMembers
} from './members';
export type {
	ProjectVisibility,
	ProjectMemberView,
	MembershipFailure,
	AddMemberFailure,
	RemoveMemberFailure
} from './members';

export {
	listTasks,
	countOpenTasks,
	myOpenTasks,
	OPEN_TASK_GROUPS,
	getTask,
	createTask,
	openTask,
	updateTask,
	assign,
	unassign,
	setAssignees,
	setTaskMilestone,
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

export {
	addProjectAttachments,
	addTaskAttachments,
	listProjectAttachments,
	listTaskAttachments,
	removeProjectAttachment,
	removeTaskAttachment,
	getProjectAttachment,
	getTaskAttachment
} from './attachments';
export type {
	AttachmentView,
	AttachmentBytes,
	AttachmentDeps,
	AddProjectAttachmentsFailure,
	AddTaskAttachmentsFailure,
	RemoveAttachmentFailure
} from './attachments';

export {
	addProjectComment,
	addTaskComment,
	listProjectComments,
	listTaskComments
} from './comments';
export type { AddProjectCommentFailure, AddTaskCommentFailure } from './comments';

export { listMilestones, createMilestone, updateMilestone, deleteMilestone } from './milestones';
export type {
	MilestoneView,
	MilestoneClock,
	CreateMilestoneInput,
	UpdateMilestoneInput,
	CreateMilestoneFailure,
	MilestoneWriteFailure
} from './milestones';
export { milestoneStatus } from './milestone-status';
export type { MilestoneStatus, MilestoneProgress } from './milestone-status';

export { moveTaskToProject } from './reparent';
export type { MoveTaskToProjectFailure } from './reparent';

export { placeBetween, spread, MIN_GAP, STEP } from '../shared/position';

export {
	createProjectInput,
	updateProjectInput,
	createTaskInput,
	updateTaskInput,
	createStateInput,
	updateStateInput,
	PROJECT_VISIBILITIES,
	RESERVED_PROJECT_TAGS,
	RESERVED_TASK_TAGS,
	TASK_TITLE_MAX,
	MILESTONE_NAME_MAX
} from './validation';
export type {
	CreateProjectInput,
	UpdateProjectInput,
	CreateTaskInput,
	UpdateTaskInput,
	CreateStateInput,
	UpdateStateInput
} from './validation';

export { projectHits, taskHits } from './search';
