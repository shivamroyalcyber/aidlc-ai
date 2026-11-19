# Requirements Document

## Introduction

The task-list feature gives idea-board its first real function. A single person can add tasks, mark them done or not done, and filter the visible list by status. The user can also remove all tasks at once with a confirmed "Clear all" action. Source of truth: `idea-board/docs/brd-task-list.md`. Out of scope: persistence, editing, deleting an individual task, reordering, counts, due dates, priorities, tags, search, multiple lists, accounts, routing, state libraries, UI libraries, new dependencies, automated tests.

Requirements 1 to 5 map to BRD requirements 1 to 5. Requirement 8 maps to BRD requirement 6 and overrides the BRD's earlier exclusion of deleting tasks for the bulk clear case only. Requirement 6 is a proposed addition (see Open Questions, item 5) and is pending user confirmation. Where an open question affects a criterion, the criterion is worded to hold under either answer.

## Glossary

- **Task_List**: The client-side React feature that holds tasks in `useState` and renders the input, filter control, and list.
- **Task**: An item with an identifier, text, and a done status.
- **Done_Status**: Whether a Task is done or not done.
- **Task_Input**: The text input where the user types new task text.
- **Add_Control**: The button that submits the Task_Input content. Pressing Enter in the Task_Input submits it too.
- **Status_Filter**: The control offering All, Done, and Not done.
- **Active_Filter**: The currently selected Status_Filter option. Its default is All.
- **Visible_List**: The Tasks shown after applying the Active_Filter.
- **Retained_Task**: A Task the user has toggled since the user last selected a Status_Filter option. A Retained_Task stays in the Visible_List whatever its Done_Status. The set of Retained_Tasks is emptied by selecting a Status_Filter option and by Clear_All.
- **Clear_All_Control**: The native button labelled "Clear all", placed above the Visible_List.
- **Clear_All**: The action that removes every Task from the Task_List after the user confirms.
- **Confirmation_Dialog**: The browser's `window.confirm` dialog, with the message "Clear all tasks?", that the user confirms or cancels.
- **Empty_Message**: Short text shown when the Visible_List has no Tasks.
- **Blank_Entry**: Task_Input content that is empty or contains only whitespace characters.

## Requirements

### Requirement 1: Add a task

**User Story:** As a user, I want to type text and add it as a task, so that I can write down what I need to do.

#### Acceptance Criteria

1. WHEN the user activates the Add_Control with a non-blank Task_Input, THE Task_List SHALL create a Task with the entered text and a Done_Status of not done.
2. WHEN the user presses Enter in the Task_Input with non-blank content, THE Task_List SHALL create a Task with the entered text and a Done_Status of not done.
3. WHEN a Task is created, THE Task_List SHALL include the new Task in the Visible_List if the new Task matches the Active_Filter.
4. WHEN a Task is created, THE Task_List SHALL clear the Task_Input.
5. THE Task_List SHALL keep every Task previously added in the Task_List after a new Task is created.

### Requirement 2: Reject blank entries

**User Story:** As a user, I want empty entries ignored, so that my list does not fill with blank tasks.

#### Acceptance Criteria

1. IF the Task_Input holds a Blank_Entry when the user activates the Add_Control or presses Enter, THEN THE Task_List SHALL leave the set of Tasks unchanged.
2. IF the Task_Input holds a Blank_Entry when the user activates the Add_Control or presses Enter, THEN THE Task_List SHALL leave the Task_Input content unchanged.

### Requirement 3: Toggle done status

**User Story:** As a user, I want to tick a task done and untick it again, so that I can track what is finished.

#### Acceptance Criteria

1. THE Task_List SHALL display one checkbox for each Task in the Visible_List.
2. THE Task_List SHALL show each checkbox as checked when its Task is done and unchecked when its Task is not done.
3. WHEN the user toggles a Task checkbox, THE Task_List SHALL switch that Task between done and not done.
4. WHEN the user toggles a Task checkbox, THE Task_List SHALL leave the Done_Status and text of every other Task unchanged.
5. THE Task_List SHALL render the text of a done Task with a visual style that differs from the text of a not-done Task.
6. WHEN the user toggles a Task checkbox, THE Task_List SHALL record that Task as a Retained_Task.

### Requirement 4: Filter by status

**User Story:** As a user, I want to view only done or not-done tasks, so that I can focus on what matters.

#### Acceptance Criteria

1. THE Status_Filter SHALL offer the options All, Done, and Not done.
2. WHEN the Task_List first renders, THE Task_List SHALL set the Active_Filter to All.
3. WHILE the Active_Filter is All, THE Task_List SHALL show every Task in the Visible_List.
4. WHILE the Active_Filter is Done, THE Task_List SHALL show in the Visible_List each Task that is done and each Retained_Task, and no other Task.
5. WHILE the Active_Filter is Not done, THE Task_List SHALL show in the Visible_List each Task that is not done and each Retained_Task, and no other Task.
6. THE Task_List SHALL visibly indicate which option is the Active_Filter.
7. WHEN the user selects a Status_Filter option, THE Task_List SHALL leave the stored Tasks and their Done_Status unchanged.
8. WHEN the user selects a Status_Filter option, THE Task_List SHALL clear all Retained_Tasks, so that the Visible_List matches the Active_Filter by current Done_Status.

### Requirement 5: Empty message

**User Story:** As a user, I want a message when no tasks match, so that I know the list is empty and not broken.

#### Acceptance Criteria

1. WHILE the Visible_List contains no Tasks, THE Task_List SHALL display the Empty_Message.
2. WHILE the Visible_List contains at least one Task, THE Task_List SHALL omit the Empty_Message.

### Requirement 6: Accessibility (proposed addition, pending confirmation)

**User Story:** As a user who relies on a keyboard or assistive technology, I want every control to be operable and labelled, so that I can use the task list without a mouse.

#### Acceptance Criteria

1. THE Task_Input SHALL have an associated text label.
2. THE Task_List SHALL render the Visible_List as a semantic list.
3. THE Task_List SHALL give each Task checkbox an accessible name equal to the text of its Task.
4. THE Task_List SHALL make the Task_Input, Add_Control, Status_Filter options, and Task checkboxes operable with the keyboard alone.
5. THE Task_List SHALL expose the Active_Filter to assistive technology through a state attribute and not through color alone.
6. WHEN a Task is toggled or the Active_Filter changes, THE Task_List SHALL keep keyboard focus on the control the user activated.

### Requirement 7: Delivery constraints

**User Story:** As a maintainer, I want the feature to follow project conventions, so that it builds and runs behind the IDE proxy.

#### Acceptance Criteria

1. THE Task_List SHALL keep all Task state in React `useState` on the client, with no persistence.
2. THE Task_List SHALL be implemented in React 19 and TypeScript using union types, `import type` for type-only imports, and no enums.
3. THE Task_List SHALL reside under `idea-board/src/` and replace the starter demo content.
4. THE Task_List SHALL introduce no new npm dependencies.
5. THE Task_List SHALL reference any asset through `import.meta.env.BASE_URL` or an import from `src/`, so that the app works at `/absproxy/5173/`.
6. WHEN `npm run lint` and `npm run build` run in `idea-board/`, THE Task_List SHALL produce no errors.

### Requirement 8: Clear all tasks

**User Story:** As a user, I want to remove all tasks in one step after a confirmation, so that I can start a fresh list without clearing tasks one by one.

#### Acceptance Criteria

1. THE Task_List SHALL display the Clear_All_Control above the Visible_List.
2. WHEN the user activates the Clear_All_Control while the Task_List holds at least one Task, THE Task_List SHALL show the Confirmation_Dialog.
3. WHEN the user confirms the Confirmation_Dialog, THE Task_List SHALL remove every Task.
4. WHEN the user confirms the Confirmation_Dialog, THE Task_List SHALL empty the set of Retained_Tasks.
5. WHEN the user cancels the Confirmation_Dialog, THE Task_List SHALL leave every Task, the Retained_Tasks, the Active_Filter, and the Task_Input content unchanged.
6. WHEN the user confirms the Confirmation_Dialog, THE Task_List SHALL leave the Active_Filter and the Task_Input content unchanged.
7. WHEN the user confirms the Confirmation_Dialog, THE Task_List SHALL display the Empty_Message.
8. WHILE the Task_List holds no Task, THE Task_List SHALL show no Confirmation_Dialog when the user attempts to activate the Clear_All_Control.
9. THE Task_List SHALL render the Clear_All_Control as a native `<button type="button">` with the accessible name "Clear all".
10. THE Task_List SHALL make the Clear_All_Control operable with the keyboard alone.

## Open Questions

Items 1 and 3 to 7 are unanswered. No answer has been assumed. Item 2 is resolved. Items 8 and 9, added with Requirement 8, are also unanswered.

1. **Order of new tasks.** Should a new Task appear at the top or the bottom of the list? Does toggling a Task keep its position or move it (for example done Tasks to the end)? Requirements 1 and 3 state only that the Task appears and that other Tasks are unchanged, which holds under either answer.
2. **Resolved: toggle under an active Done or Not done filter.** A toggled Task stays in the Visible_List until the user next selects a Status_Filter option (Requirements 3.6, 4.4, 4.5, 4.8). This keeps keyboard focus on its checkbox (Requirement 6.6). A newly added Task is not a Retained_Task.
3. **Adding while the Done filter is active.** A new Task is not done. Should it stay hidden, or should the Active_Filter switch to All? Requirement 1.3 is worded as "include if it matches", which assumes the hidden answer for the Done filter. Pending your answer.
4. **Text handling.** Should saved text be trimmed or stored as typed? Is there a maximum length? Are duplicate Tasks allowed? Requirements 1 and 2 define only Blank_Entry rejection. Pending your answer. Duplicates are currently permitted by omission.
5. **Accessibility criteria.** Steering requires semantic and keyboard-operable UI, but the BRD has no matching requirement. Requirement 6 is proposed by this spec and is not in the BRD. Please confirm, edit, or remove it.
6. **Form of the Status_Filter.** Buttons, radio buttons, or a select? Requirement 4 and Requirement 6.5 are worded to hold for any of them. Pending your answer.
7. **No persistence.** The BRD lists no persistence as out of scope, but this is an unconfirmed assumption. Tasks are lost on reload. Requirement 7.1 follows the BRD. Please confirm that this is acceptable.
8. **Clear all with no tasks.** Should the Clear_All_Control be disabled or hidden when the Task_List holds no Task? Assumption, not an answer: disabled, so that no Confirmation_Dialog appears for nothing. Requirement 8.8 holds under either choice. Pending your answer.
9. **Clear all placement.** Where does the Clear_All_Control sit relative to the Status_Filter? Assumption, not an answer: directly above the Visible_List and below the Status_Filter. Requirement 8.1 requires only "above the Visible_List". Pending your answer.
