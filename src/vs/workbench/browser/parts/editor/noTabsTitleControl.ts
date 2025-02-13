/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notabstitlecontrol';
import { toResource, Verbosity, IEditorInput, IEditorPartOptions, SideBySideEditor } from 'vs/workbench/common/editor';
import { TitleControl, IToolbarActions } from 'vs/workbench/browser/parts/editor/titleControl';
import { ResourceLabel, IResourceLabel } from 'vs/workbench/browser/labels';
import { TAB_ACTIVE_FOREGROUND, TAB_UNFOCUSED_ACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { EventType as TouchEventType, GestureEvent, Gesture } from 'vs/base/browser/touch';
import { addDisposableListener, EventType, addClass, EventHelper, removeClass, toggleClass } from 'vs/base/browser/dom';
import { EDITOR_TITLE_HEIGHT_ONE_ROW } from 'vs/workbench/browser/parts/editor/editor';
import { IAction } from 'vs/base/common/actions';
import { CLOSE_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { Color } from 'vs/base/common/color';
import { withNullAsUndefined, assertIsDefined, assertAllDefined } from 'vs/base/common/types';

interface IRenderedEditorLabel {
	editor?: IEditorInput;
	pinned: boolean;
}

export class NoTabsTitleControl extends TitleControl {
	private titleContainer: HTMLElement | undefined;
	private editorLabel: IResourceLabel | undefined;
	private activeLabel: IRenderedEditorLabel = Object.create(null);

	protected create(parent: HTMLElement): void {
		const titleContainer = this.titleContainer = parent;
		titleContainer.draggable = true;

		//Container listeners
		this.registerContainerListeners(titleContainer);

		// Gesture Support
		this._register(Gesture.addTarget(titleContainer));

		const labelContainer = document.createElement('div');
		addClass(labelContainer, 'label-container');
		titleContainer.appendChild(labelContainer);

		// Editor Label
		this.editorLabel = this._register(this.instantiationService.createInstance(ResourceLabel, labelContainer, undefined)).element;
		this._register(addDisposableListener(this.editorLabel.element, EventType.CLICK, e => this.onTitleLabelClick(e)));

		// Breadcrumbs
		this.createBreadcrumbsControl(labelContainer, { showFileIcons: false, showSymbolIcons: true, showDecorationColors: false, breadcrumbsBackground: () => Color.transparent });
		toggleClass(titleContainer, 'breadcrumbs', Boolean(this.breadcrumbsControl));
		this._register({ dispose: () => removeClass(titleContainer, 'breadcrumbs') }); // import to remove because the container is a shared dom node

		// Right Actions Container
		const actionsContainer = document.createElement('div');
		addClass(actionsContainer, 'title-actions');
		titleContainer.appendChild(actionsContainer);

		// Editor actions toolbar
		this.createEditorActionsToolBar(actionsContainer);
	}

	private registerContainerListeners(titleContainer: HTMLElement): void {

		// Group dragging
		this.enableGroupDragging(titleContainer);

		// Pin on double click
		this._register(addDisposableListener(titleContainer, EventType.DBLCLICK, (e: MouseEvent) => this.onTitleDoubleClick(e)));

		// Detect mouse click
		this._register(addDisposableListener(titleContainer, EventType.MOUSE_UP, (e: MouseEvent) => this.onTitleClick(e)));

		// Detect touch
		this._register(addDisposableListener(titleContainer, TouchEventType.Tap, (e: GestureEvent) => this.onTitleClick(e)));

		// Context Menu
		this._register(addDisposableListener(titleContainer, EventType.CONTEXT_MENU, (e: Event) => {
			if (this.group.activeEditor) {
				this.onContextMenu(this.group.activeEditor, e, titleContainer);
			}
		}));
		this._register(addDisposableListener(titleContainer, TouchEventType.Contextmenu, (e: Event) => {
			if (this.group.activeEditor) {
				this.onContextMenu(this.group.activeEditor, e, titleContainer);
			}
		}));
	}

	private onTitleLabelClick(e: MouseEvent): void {
		EventHelper.stop(e, false);

		// delayed to let the onTitleClick() come first which can cause a focus change which can close quick open
		setTimeout(() => this.quickOpenService.show());
	}

	private onTitleDoubleClick(e: MouseEvent): void {
		EventHelper.stop(e);

		this.group.pinEditor();
	}

	private onTitleClick(e: MouseEvent | GestureEvent): void {

		// Close editor on middle mouse click
		if (e instanceof MouseEvent && e.button === 1 /* Middle Button */) {
			EventHelper.stop(e, true /* for https://github.com/Microsoft/vscode/issues/56715 */);

			if (this.group.activeEditor) {
				this.group.closeEditor(this.group.activeEditor);
			}
		}
	}

	getPreferredHeight(): number {
		return EDITOR_TITLE_HEIGHT_ONE_ROW;
	}

	openEditor(editor: IEditorInput): void {
		const activeEditorChanged = this.ifActiveEditorChanged(() => this.redraw());
		if (!activeEditorChanged) {
			this.ifActiveEditorPropertiesChanged(() => this.redraw());
		}
	}

	adhsEditor(editor: IEditorInput): void { }

	unadhsEditor(editor: IEditorInput): void { }

	closeEditor(editor: IEditorInput): void {
		this.ifActiveEditorChanged(() => this.redraw());
	}

	closeEditors(editors: IEditorInput[]): void {
		this.ifActiveEditorChanged(() => this.redraw());
	}

	closeAllEditors(): void {
		this.redraw();
	}

	moveEditor(editor: IEditorInput, fromIndex: number, targetIndex: number): void {
		this.ifActiveEditorChanged(() => this.redraw());
	}

	pinEditor(editor: IEditorInput): void {
		this.ifEditorIsActive(editor, () => this.redraw());
	}

	setActive(isActive: boolean): void {
		this.redraw();
	}

	updateEditorLabel(editor: IEditorInput): void {
		this.ifEditorIsActive(editor, () => this.redraw());
	}

	updateEditorLabels(): void {
		if (this.group.activeEditor) {
			this.updateEditorLabel(this.group.activeEditor); // we only have the active one to update
		}
	}

	updateEditorDirty(editor: IEditorInput): void {
		this.ifEditorIsActive(editor, () => {
			const titleContainer = assertIsDefined(this.titleContainer);
			if (editor.isDirty()) {
				addClass(titleContainer, 'dirty');
			} else {
				removeClass(titleContainer, 'dirty');
			}
		});
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		if (oldOptions.labelFormat !== newOptions.labelFormat) {
			this.redraw();
		}
	}

	updateStyles(): void {
		this.redraw();
	}

	protected handleBreadcrumbsEnablementChange(): void {
		const titleContainer = assertIsDefined(this.titleContainer);

		toggleClass(titleContainer, 'breadcrumbs', Boolean(this.breadcrumbsControl));
		this.redraw();
	}

	private ifActiveEditorChanged(fn: () => void): boolean {
		if (
			!this.activeLabel.editor && this.group.activeEditor || 	// active editor changed from null => editor
			this.activeLabel.editor && !this.group.activeEditor || 	// active editor changed from editor => null
			(!this.activeLabel.editor || !this.group.isActive(this.activeLabel.editor))			// active editor changed from editorA => editorB
		) {
			fn();

			return true;
		}

		return false;
	}

	private ifActiveEditorPropertiesChanged(fn: () => void): void {
		if (!this.activeLabel.editor || !this.group.activeEditor) {
			return; // need an active editor to check for properties changed
		}

		if (this.activeLabel.pinned !== this.group.isPinned(this.group.activeEditor)) {
			fn(); // only run if pinned state has changed
		}
	}


	private ifEditorIsActive(editor: IEditorInput, fn: () => void): void {
		if (this.group.isActive(editor)) {
			fn();  // only run if editor is current active
		}
	}

	private redraw(): void {
		const editor = withNullAsUndefined(this.group.activeEditor);

		const isEditorPinned = this.group.activeEditor ? this.group.isPinned(this.group.activeEditor) : false;
		const isGroupActive = this.accessor.activeGroup === this.group;

		this.activeLabel = { editor, pinned: isEditorPinned };

		// Update Breadcrumbs
		if (this.breadcrumbsControl) {
			if (isGroupActive) {
				this.breadcrumbsControl.update();
				toggleClass(this.breadcrumbsControl.domNode, 'preview', !isEditorPinned);
			} else {
				this.breadcrumbsControl.hide();
			}
		}

		// Clear if there is no editor
		const [titleContainer, editorLabel] = assertAllDefined(this.titleContainer, this.editorLabel);
		if (!editor) {
			removeClass(titleContainer, 'dirty');
			editorLabel.clear();
			this.clearEditorActionsToolbar();
		}

		// Otherwise render it
		else {

			// Dirty state
			this.updateEditorDirty(editor);

			// Editor Label
			const resource = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
			const name = editor.getName();

			const { labelFormat } = this.accessor.partOptions;
			let description: string;
			if (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden()) {
				description = ''; // hide description when showing breadcrumbs
			} else if (labelFormat === 'default' && !isGroupActive) {
				description = ''; // hide description when group is not active and style is 'default'
			} else {
				description = editor.getDescription(this.getVerbosity(labelFormat)) || '';
			}

			let title = editor.getTitle(Verbosity.LONG);
			if (description === title) {
				title = ''; // dont repeat what is already shown
			}

			editorLabel.setResource({ name, description, resource }, { title: typeof title === 'string' ? title : undefined, italic: !isEditorPinned, extraClasses: ['no-tabs', 'title-label'] });
			if (isGroupActive) {
				editorLabel.element.style.color = this.getColor(TAB_ACTIVE_FOREGROUND);
			} else {
				editorLabel.element.style.color = this.getColor(TAB_UNFOCUSED_ACTIVE_FOREGROUND);
			}

			// Update Editor Actions Toolbar
			this.updateEditorActionsToolbar();
		}
	}

	private getVerbosity(style: string | undefined): Verbosity {
		switch (style) {
			case 'short': return Verbosity.SHORT;
			case 'long': return Verbosity.LONG;
			default: return Verbosity.MEDIUM;
		}
	}

	protected prepareEditorActions(editorActions: IToolbarActions): { primaryEditorActions: IAction[], secondaryEditorActions: IAction[] } {
		const isGroupActive = this.accessor.activeGroup === this.group;

		// Group active: show all actions
		if (isGroupActive) {
			return super.prepareEditorActions(editorActions);
		}

		// Group inactive: only show close action
		return { primaryEditorActions: editorActions.primary.filter(action => action.id === CLOSE_EDITOR_COMMAND_ID), secondaryEditorActions: [] };
	}
}
