/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/tabstitlecontrol';
import { isMacintosh } from 'vs/base/common/platform';
import { shorten } from 'vs/base/common/labels';
import { toResource, GroupIdentifier, IEditorInput, Verbosity, EditorCommandsContextActionRunner, IEditorPartOptions, SideBySideEditor } from 'vs/workbench/common/editor';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventType as TouchEventType, GestureEvent, Gesture } from 'vs/base/browser/touch';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ResourceLabels, IResourceLabel, DEFAULT_LABELS_CONTAINER } from 'vs/workbench/browser/labels';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { TitleControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IDisposable, dispose, DisposableStore, combinedDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { getOrSet } from 'vs/base/common/map';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { TAB_INACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_FOREGROUND, TAB_INACTIVE_FOREGROUND, TAB_BORDER, EDITOR_DRAG_AND_DROP_BACKGROUND, TAB_UNFOCUSED_ACTIVE_FOREGROUND, TAB_UNFOCUSED_INACTIVE_FOREGROUND, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_ACTIVE_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_UNFOCUSED_HOVER_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND, WORKBENCH_BACKGROUND, TAB_ACTIVE_BORDER_TOP, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, TAB_ACTIVE_MODIFIED_BORDER, TAB_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER } from 'vs/workbench/common/theme';
import { activeContrastBorder, contrastBorder, editorBackground, breadcrumbsBackground } from 'vs/platform/theme/common/colorRegistry';
import { ResourcesDropHandler, fillResourceDataTransfers, DraggedEditorIdentifier, DraggedEditorGroupIdentifier, DragAndDropObserver } from 'vs/workbench/browser/dnd';
import { Color } from 'vs/base/common/color';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { MergeGroupMode, IMergeGroupOptions, GroupsArrangement } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { addClass, addDisposableListener, hasClass, EventType, EventHelper, removeClass, Dimension, scheduleAtNextAnimationFrame, findParentWithClass, clearNode } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IEditorGroupsAccessor, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { CloseOneEditorAction, AdhsEditorAction, UnadhsEditorAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { BreadcrumbsControl } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { IFileService } from 'vs/platform/files/common/files';
import { withNullAsUndefined, assertAllDefined, assertIsDefined } from 'vs/base/common/types';
import { ILabelService } from 'vs/platform/label/common/label';

interface IEditorInputLabel {
	name?: string;
	description?: string;
	title?: string;
}

type AugmentedLabel = IEditorInputLabel & { editor: IEditorInput };

export class TabsTitleControl extends TitleControl {

	private titleContainer: HTMLElement | undefined;
	private adhsdContainer: HTMLDivElement | undefined;
	private adhsntContainer: HTMLDivElement | undefined;
	private editorToolbarContainer: HTMLElement | undefined;
	private tabsScrollbar: ScrollableElement | undefined;

	private closeOneEditorAction: CloseOneEditorAction;
	private AdhsEditorAction: AdhsEditorAction;
	private UnadhsEditorAction: UnadhsEditorAction;

	private tabResourceLabels: ResourceLabels;
	private tabLabels: IEditorInputLabel[] = [];
	private tabDisposables: IDisposable[] = [];

	private dimension: Dimension | undefined;
	private readonly layoutScheduled = this._register(new MutableDisposable());
	private blockRevealActiveTab: boolean | undefined;

	constructor(
		parent: HTMLElement,
		accessor: IEditorGroupsAccessor,
		group: IEditorGroupView,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IMenuService menuService: IMenuService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IThemeService themeService: IThemeService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService
	) {
		super(parent, accessor, group, contextMenuService, instantiationService, contextKeyService, keybindingService, telemetryService, notificationService, menuService, quickOpenService, themeService, extensionService, configurationService, fileService, labelService);

		this.tabResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		this.closeOneEditorAction = this._register(this.instantiationService.createInstance(CloseOneEditorAction, CloseOneEditorAction.ID, CloseOneEditorAction.LABEL));
		this.AdhsEditorAction = this._register(this.instantiationService.createInstance(AdhsEditorAction, AdhsEditorAction.ID, AdhsEditorAction.LABEL));
		this.UnadhsEditorAction = this._register(this.instantiationService.createInstance(UnadhsEditorAction, UnadhsEditorAction.ID, UnadhsEditorAction.LABEL));
	}

	protected create(parent: HTMLElement): void {
		this.titleContainer = parent;

		// Tabs and Actions Container (are on a single row with flex side-by-side)
		const tabsAndActionsContainer = document.createElement('div');
		addClass(tabsAndActionsContainer, 'tabs-and-actions-container');
		this.titleContainer.appendChild(tabsAndActionsContainer);

		// Container for the two tabs containers
		const tabsContainer = document.createElement('div');
		tabsContainer.setAttribute('role', 'tablist');
		tabsContainer.draggable = true;
		addClass(tabsContainer, 'tabs-container');

		// container for adhsd tabs
		this.adhsdContainer = document.createElement('div');
		this.adhsdContainer.setAttribute('role', 'tablist');
		this.adhsdContainer.draggable = true;
		addClass(this.adhsdContainer, 'adhsd-container');
		tabsContainer.appendChild(this.adhsdContainer);

		// container for adhsnt tabs
		this.adhsntContainer = document.createElement('div');
		this.adhsdContainer.setAttribute('role', 'tablist');
		this.adhsntContainer.draggable = true;
		addClass(this.adhsntContainer, 'adhsnt-container');
		tabsContainer.appendChild(this.adhsntContainer);

		// Tabs Scrollbar
		this.tabsScrollbar = this._register(this.createTabsScrollbar(tabsContainer));
		tabsAndActionsContainer.appendChild(this.tabsScrollbar.getDomNode());

		// Tabs Container listeners
		this.registerTabsContainerListeners(this.adhsdContainer, this.tabsScrollbar);
		this.registerTabsContainerListeners(this.adhsntContainer, this.tabsScrollbar);

		// Editor Toolbar Container
		this.editorToolbarContainer = document.createElement('div');
		addClass(this.editorToolbarContainer, 'editor-actions');
		tabsAndActionsContainer.appendChild(this.editorToolbarContainer);

		// Editor Actions Toolbar
		this.createEditorActionsToolBar(this.editorToolbarContainer);

		// Breadcrumbs (are on a separate row below tabs and actions)
		const breadcrumbsContainer = document.createElement('div');
		addClass(breadcrumbsContainer, 'tabs-breadcrumbs');
		this.titleContainer.appendChild(breadcrumbsContainer);
		this.createBreadcrumbsControl(breadcrumbsContainer, { showFileIcons: true, showSymbolIcons: true, showDecorationColors: false, breadcrumbsBackground: breadcrumbsBackground });
	}

	private createTabsScrollbar(scrollable: HTMLElement): ScrollableElement {
		const tabsScrollbar = new ScrollableElement(scrollable, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
			horizontalScrollbarSize: 3
		});

		tabsScrollbar.onScroll(e => {
			scrollable.scrollLeft = e.scrollLeft;
		});

		return tabsScrollbar;
	}

	private updateBreadcrumbsControl(): void {
		if (this.breadcrumbsControl && this.breadcrumbsControl.update()) {
			// relayout when we have a breadcrumbs and when update changed
			// its hidden-status
			this.group.relayout();
		}
	}

	protected handleBreadcrumbsEnablementChange(): void {
		// relayout when breadcrumbs are enable/disabled
		this.group.relayout();
	}

	private registerTabsContainerListeners(tabsContainer: HTMLElement, tabsScrollbar: ScrollableElement): void {

		// Group dragging
		this.enableGroupDragging(tabsContainer);

		// Forward scrolling inside the container to our custom scrollbar
		this._register(addDisposableListener(tabsContainer, EventType.SCROLL, () => {
			if (hasClass(tabsContainer, 'scroll')) {
				tabsScrollbar.setScrollPosition({
					scrollLeft: tabsContainer.scrollLeft // during DND the  container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));

		// New file when double clicking on tabs container (but not tabs)
		this._register(addDisposableListener(tabsContainer, EventType.DBLCLICK, e => {
			if (e.target === tabsContainer) {
				EventHelper.stop(e);

				this.group.openEditor(this.untitledTextEditorService.createOrGet(), { pinned: true /* untitled is always pinned */, index: this.group.count /* always at the end */ });
			}
		}));

		// Prevent auto-scrolling (https://github.com/Microsoft/vscode/issues/16690)
		this._register(addDisposableListener(tabsContainer, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.button === 1) {
				e.preventDefault();
			}
		}));

		// Drop support
		this._register(new DragAndDropObserver(tabsContainer, {
			onDragEnter: e => {

				// Always enable support to scroll while dragging
				addClass(tabsContainer, 'scroll');

				// Return if the target is not on the tabs container
				if (e.target !== tabsContainer) {
					this.updateDropFeedback(tabsContainer, false); // fixes https://github.com/Microsoft/vscode/issues/52093
					return;
				}

				// Return if transfer is unsupported
				if (!this.isSupportedDropTransfer(e)) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'none';
					}

					return;
				}

				// Return if dragged editor is last tab because then this is a no-op
				let isLocalDragAndDrop = false;
				if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
					isLocalDragAndDrop = true;

					const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
					if (Array.isArray(data)) {
						const localDraggedEditor = data[0].identifier;
						if (this.group.id === localDraggedEditor.groupId && this.group.getIndexOfEditor(localDraggedEditor.editor) === this.group.count - 1) {
							if (e.dataTransfer) {
								e.dataTransfer.dropEffect = 'none';
							}

							return;
						}
					}
				}

				// Update the dropEffect to "copy" if there is no local data to be dragged because
				// in that case we can only copy the data into and not move it from its source
				if (!isLocalDragAndDrop) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'copy';
					}
				}

				this.updateDropFeedback(tabsContainer, true);
			},

			onDragLeave: e => {
				this.updateDropFeedback(tabsContainer, false);
				removeClass(tabsContainer, 'scroll');
			},

			onDragEnd: e => {
				this.updateDropFeedback(tabsContainer, false);
				removeClass(tabsContainer, 'scroll');
			},

			onDrop: e => {
				this.updateDropFeedback(tabsContainer, false);
				removeClass(tabsContainer, 'scroll');

				if (e.target === tabsContainer) {
					const targetIndex = tabsContainer === this.adhsdContainer ? this.group.getAdhsdCount() : this.group.count;
					this.onDrop(e, targetIndex, tabsContainer);
				}
			}
		}));
	}

	protected updateEditorActionsToolbar(): void {
		super.updateEditorActionsToolbar();

		// Changing the actions in the toolbar can have an impact on the size of the
		// tab container, so we need to layout the tabs to make sure the active is visible
		this.layout(this.dimension);
	}

	openEditor(editor: IEditorInput): void {

		// Create tabs as needed
		// New tabs will always be adhsnt, so we only need to add to the adhsnt container.
		const [adhsntContainer, adhsdContainer, tabsScrollbar] = assertAllDefined(this.adhsntContainer, this.adhsdContainer, this.tabsScrollbar);
		const adhsdCount = adhsdContainer.children.length;
		for (let i = adhsntContainer.children.length + adhsdCount; i < this.group.count; i++) {
			adhsntContainer.appendChild(this.createTab(i, adhsntContainer, tabsScrollbar));
		}

		// An add of a tab requires to recompute all labels
		this.computeTabLabels();

		// Redraw all tabs
		this.redraw();

		// Update Breadcrumbs
		this.updateBreadcrumbsControl();
	}

	closeEditor(editor: IEditorInput): void {
		this.handleClosedEditors();
	}

	closeEditors(editors: IEditorInput[]): void {
		this.handleClosedEditors();
	}

	closeAllEditors(): void {
		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {

		// There are tabs to show
		if (this.group.activeEditor) {

			// Remove tabs that got closed
			for (let i = this.numTabs(); i > this.group.count; i--) {

				// Remove one tab from container (must be the last to keep indexes in order!)
				this.removeTabAtIndex(i - 1);

				// Remove associated tab label and widget
				dispose(this.tabDisposables.pop());
			}

			// Make sure only adhsd tabs are in the adhsd container
			const adhsdContainer = assertIsDefined(this.adhsdContainer);
			for (let i = adhsdContainer.children.length; i > this.group.getAdhsdCount(); i--) {
				this.reparentAdhsdToAdhsnt(adhsdContainer.children[i - 1] as HTMLElement);
			}

			// A removal of a label requires to recompute all labels
			this.computeTabLabels();

			// Redraw all tabs
			this.redraw();
		}

		// No tabs to show
		else {
			if (this.adhsdContainer) {
				clearNode(this.adhsdContainer);
			}

			if (this.adhsntContainer) {
				clearNode(this.adhsntContainer);
			}

			this.tabDisposables = dispose(this.tabDisposables);
			this.tabResourceLabels.clear();
			this.tabLabels = [];

			this.clearEditorActionsToolbar();
		}

		// Update Breadcrumbs
		this.updateBreadcrumbsControl();
	}

	moveEditor(editor: IEditorInput, fromIndex: number, targetIndex: number): void {

		// Swap the editor label
		const editorLabel = this.tabLabels[fromIndex];
		this.tabLabels.splice(fromIndex, 1);
		this.tabLabels.splice(targetIndex, 0, editorLabel);

		// As such we need to redraw each tab
		this.forEachTab((editor, index, tabContainer, tabLabelWidget, tabLabel) => {
			this.redrawTab(editor, index, tabContainer, tabLabelWidget, tabLabel);
		});

		// Moving an editor requires a layout to keep the active editor visible
		this.layout(this.dimension);
	}

	pinEditor(editor: IEditorInput): void {
		this.withTab(editor, (editor, index, tabContainer, tabLabelWidget, tabLabel) => this.redrawLabel(editor, tabContainer, tabLabelWidget, tabLabel));
	}

	adhsEditor(editor: IEditorInput): void {
		this.withTab(editor, (editor, index, tabContainer, tabLabelWidget, tabLabel) => {
			this.reparentAdhsntToAdhsd(tabContainer, index);
		});

		this.group.group.incrementAdhsdCount();
		this.redraw();
	}

	unadhsEditor(editor: IEditorInput): void {
		this.withTab(editor, (editor, index, tabContainer, tabLabelWidget, tabLabel) => {
			this.reparentAdhsdToAdhsnt(tabContainer);
		});

		this.group.group.decrementAdhsdCount();
		this.redraw();
	}

	setActive(isGroupActive: boolean): void {

		// Activity has an impact on each tab
		this.forEachTab((editor, index, tabContainer, tabLabelWidget, tabLabel) => {
			this.redrawEditorActiveAndDirty(isGroupActive, editor, tabContainer, tabLabelWidget);
		});

		// Activity has an impact on the toolbar, so we need to update and layout
		this.updateEditorActionsToolbar();
		this.layout(this.dimension);
	}

	updateEditorLabel(editor: IEditorInput): void {

		// Update all labels to account for changes to tab labels
		this.updateEditorLabels();
	}

	updateEditorLabels(): void {

		// A change to a label requires to recompute all labels
		this.computeTabLabels();

		// As such we need to redraw each label
		this.forEachTab((editor, index, tabContainer, tabLabelWidget, tabLabel) => {
			this.redrawLabel(editor, tabContainer, tabLabelWidget, tabLabel);
		});

		// A change to a label requires a layout to keep the active editor visible
		this.layout(this.dimension);
	}

	updateEditorDirty(editor: IEditorInput): void {
		this.withTab(editor, (editor, index, tabContainer, tabLabelWidget) => this.redrawEditorActiveAndDirty(this.accessor.activeGroup === this.group, editor, tabContainer, tabLabelWidget));
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {

		// A change to a label format options requires to recompute all labels
		if (oldOptions.labelFormat !== newOptions.labelFormat) {
			this.computeTabLabels();
		}

		// Apply new options if something of interest changed
		if (
			oldOptions.labelFormat !== newOptions.labelFormat ||
			oldOptions.tabCloseButton !== newOptions.tabCloseButton ||
			oldOptions.tabSizing !== newOptions.tabSizing ||
			oldOptions.showIcons !== newOptions.showIcons ||
			oldOptions.iconTheme !== newOptions.iconTheme ||
			oldOptions.highlightModifiedTabs !== newOptions.highlightModifiedTabs
		) {
			this.redraw();
		}
	}

	updateStyles(): void {
		this.redraw();
	}

	private forEachTab(fn: (editor: IEditorInput, index: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel) => void): void {
		this.group.editors.forEach((editor, index) => {
			this.doWithTab(index, editor, fn);
		});
	}

	private withTab(editor: IEditorInput, fn: (editor: IEditorInput, index: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel) => void): void {
		this.doWithTab(this.group.getIndexOfEditor(editor), editor, fn);
	}

	private doWithTab(index: number, editor: IEditorInput, fn: (editor: IEditorInput, index: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel) => void): void {
		const tabContainer = assertIsDefined(this.getTabAtIndex(index));
		const tabResourceLabel = this.tabResourceLabels.get(index);
		const tabLabel = this.tabLabels[index];
		if (tabContainer && tabResourceLabel && tabLabel) {
			fn(editor, index, tabContainer, tabResourceLabel, tabLabel);
		}
	}

	private createTab(index: number, tabsContainer: HTMLElement, tabsScrollbar: ScrollableElement): HTMLElement {

		// Tab Container
		const tabContainer = document.createElement('div');
		tabContainer.draggable = true;
		tabContainer.tabIndex = 0;
		tabContainer.setAttribute('role', 'presentation'); // cannot use role "tab" here due to https://github.com/Microsoft/vscode/issues/8659
		addClass(tabContainer, 'tab');

		// Gesture Support
		this._register(Gesture.addTarget(tabContainer));

		// Tab Border Top
		const tabBorderTopContainer = document.createElement('div');
		addClass(tabBorderTopContainer, 'tab-border-top-container');
		tabContainer.appendChild(tabBorderTopContainer);

		// Tab Editor Label
		const editorLabel = this.tabResourceLabels.create(tabContainer);

		// Tab Adhs Button
		const tabAdhsContainer = document.createElement('div');

		// Tab Unadhs Button
		const tabUnadhsContainer = document.createElement('div');

		addClass(tabAdhsContainer, 'tab-adhs');
		tabContainer.appendChild(tabAdhsContainer);
		tabContainer.appendChild(tabUnadhsContainer);
		addClass(tabUnadhsContainer, 'hidden');
		addClass(tabUnadhsContainer, 'tab-unadhs');

		// Tab Close Button
		const tabCloseContainer = document.createElement('div');
		addClass(tabCloseContainer, 'tab-close');
		tabContainer.appendChild(tabCloseContainer);

		// Tab Border Bottom
		const tabBorderBottomContainer = document.createElement('div');
		addClass(tabBorderBottomContainer, 'tab-border-bottom-container');
		tabContainer.appendChild(tabBorderBottomContainer);

		const tabActionRunner = new EditorCommandsContextActionRunner({ groupId: this.group.id, editorIndex: index });

		const tabActionBar = new ActionBar(tabCloseContainer, { ariaLabel: localize('araLabelTabActions', "Tab actions"), actionRunner: tabActionRunner });
		tabActionBar.push(this.closeOneEditorAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.closeOneEditorAction) });
		tabActionBar.onDidBeforeRun(() => this.blockRevealActiveTabOnce());

		const tabAdhsBar = new ActionBar(tabAdhsContainer, { ariaLabel: localize('araLabelTabActions', "Tab actions"), actionRunner: tabActionRunner });
		tabAdhsBar.push(this.AdhsEditorAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.AdhsEditorAction) });
		tabAdhsBar.onDidBeforeRun(() => this.blockRevealActiveTabOnce());

		const tabUnadhsBar = new ActionBar(tabUnadhsContainer, { ariaLabel: localize('araLabelTabActions', "Tab actions"), actionRunner: tabActionRunner });
		tabUnadhsBar.push(this.UnadhsEditorAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.UnadhsEditorAction) });
		tabUnadhsBar.onDidBeforeRun(() => this.blockRevealActiveTabOnce());

		// Eventing
		const eventsDisposable = this.registerTabListeners(tabContainer, index, tabsContainer, tabsScrollbar);

		this.tabDisposables.push(combinedDisposable(eventsDisposable, tabActionBar, tabAdhsBar, tabUnadhsBar, tabActionRunner, editorLabel));

		return tabContainer;
	}

	private registerTabListeners(tab: HTMLElement, index: number, tabsContainer: HTMLElement, tabsScrollbar: ScrollableElement): IDisposable {
		const disposables = new DisposableStore();

		const handleClickOrTouch = (e: MouseEvent | GestureEvent): void => {
			tab.blur();

			if (e instanceof MouseEvent && e.button !== 0) {
				if (e.button === 1) {
					e.preventDefault(); // required to prevent auto-scrolling (https://github.com/Microsoft/vscode/issues/16690)
				}

				return undefined; // only for left mouse click
			}

			if (this.originatesFromTabActionBar(e)) {
				return; // not when clicking on actions
			}

			// Open tabs editor
			const input = this.group.getEditorByIndex(index);
			if (input) {
				this.group.openEditor(input);
			}

			return undefined;
		};

		const showContextMenu = (e: Event) => {
			EventHelper.stop(e);

			const input = this.group.getEditorByIndex(index);
			if (input) {
				this.onContextMenu(input, e, tab);
			}
		};

		// Open on Click / Touch
		disposables.add(addDisposableListener(tab, EventType.MOUSE_DOWN, (e: MouseEvent) => handleClickOrTouch(e)));
		disposables.add(addDisposableListener(tab, TouchEventType.Tap, (e: GestureEvent) => handleClickOrTouch(e)));

		// Touch Scroll Support
		disposables.add(addDisposableListener(tab, TouchEventType.Change, (e: GestureEvent) => {
			tabsScrollbar.setScrollPosition({ scrollLeft: tabsScrollbar.getScrollPosition().scrollLeft - e.translationX });
		}));

		// Close on mouse middle click
		disposables.add(addDisposableListener(tab, EventType.MOUSE_UP, (e: MouseEvent) => {
			EventHelper.stop(e);

			tab.blur();

			if (e.button === 1 /* Middle Button*/) {
				e.stopPropagation(); // for https://github.com/Microsoft/vscode/issues/56715

				this.blockRevealActiveTabOnce();
				this.closeOneEditorAction.run({ groupId: this.group.id, editorIndex: index });
			}
		}));

		// Context menu on Shift+F10
		disposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.shiftKey && event.keyCode === KeyCode.F10) {
				showContextMenu(e);
			}
		}));

		// Context menu on touch context menu gesture
		disposables.add(addDisposableListener(tab, TouchEventType.Contextmenu, (e: GestureEvent) => {
			showContextMenu(e);
		}));

		// Keyboard accessibility
		disposables.add(addDisposableListener(tab, EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let handled = false;

			// Run action on Enter/Space
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				handled = true;
				const input = this.group.getEditorByIndex(index);
				if (input) {
					this.group.openEditor(input);
				}
			}

			// Navigate in editors
			else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some(kb => event.equals(kb))) {
				let targetIndex: number;
				if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
					targetIndex = index - 1;
				} else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
					targetIndex = index + 1;
				} else if (event.equals(KeyCode.Home)) {
					targetIndex = 0;
				} else {
					targetIndex = this.group.count - 1;
				}

				const target = this.group.getEditorByIndex(targetIndex);
				if (target) {
					handled = true;
					this.group.openEditor(target, { preserveFocus: true });
					const tab = assertIsDefined(this.getTabAtIndex(targetIndex));
					tab.focus();
				}
			}

			if (handled) {
				EventHelper.stop(e, true);
			}

			// moving in the tabs container can have an impact on scrolling position, so we need to update the custom scrollbar
			tabsScrollbar.setScrollPosition({
				scrollLeft: tabsContainer.scrollLeft
			});
		}));

		// Double click: either pin or toggle maximized
		disposables.add(addDisposableListener(tab, EventType.DBLCLICK, (e: MouseEvent) => {
			EventHelper.stop(e);

			const editor = this.group.getEditorByIndex(index);
			if (editor && this.group.isPinned(editor)) {
				this.accessor.arrangeGroups(GroupsArrangement.TOGGLE, this.group);
			} else {
				this.group.pinEditor(editor);
			}
		}));

		// Context menu
		disposables.add(addDisposableListener(tab, EventType.CONTEXT_MENU, (e: Event) => {
			EventHelper.stop(e, true);

			const input = this.group.getEditorByIndex(index);
			if (input) {
				this.onContextMenu(input, e, tab);
			}
		}, true /* use capture to fix https://github.com/Microsoft/vscode/issues/19145 */));

		// Drag support
		disposables.add(addDisposableListener(tab, EventType.DRAG_START, (e: DragEvent) => {
			const editor = this.group.getEditorByIndex(index);
			if (!editor) {
				return;
			}

			this.editorTransfer.setData([new DraggedEditorIdentifier({ editor, groupId: this.group.id })], DraggedEditorIdentifier.prototype);

			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'copyMove';
			}

			// Apply some datatransfer types to allow for dragging the element outside of the application
			const resource = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
			if (resource) {
				this.instantiationService.invokeFunction(fillResourceDataTransfers, [resource], e);
			}

			// Fixes https://github.com/Microsoft/vscode/issues/18733
			addClass(tab, 'dragged');
			scheduleAtNextAnimationFrame(() => removeClass(tab, 'dragged'));
		}));

		// Drop support
		disposables.add(new DragAndDropObserver(tab, {
			onDragEnter: e => {

				// Update class to signal drag operation
				addClass(tab, 'dragged-over');

				// Return if transfer is unsupported
				if (!this.isSupportedDropTransfer(e)) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'none';
					}

					return;
				}

				// Return if dragged editor is the current tab dragged over
				let isLocalDragAndDrop = false;
				if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
					isLocalDragAndDrop = true;

					const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
					if (Array.isArray(data)) {
						const localDraggedEditor = data[0].identifier;
						if (localDraggedEditor.editor === this.group.getEditorByIndex(index) && localDraggedEditor.groupId === this.group.id) {
							if (e.dataTransfer) {
								e.dataTransfer.dropEffect = 'none';
							}

							return;
						}
					}
				}

				// Update the dropEffect to "copy" if there is no local data to be dragged because
				// in that case we can only copy the data into and not move it from its source
				if (!isLocalDragAndDrop) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'copy';
					}
				}

				this.updateDropFeedback(tab, true, index);
			},

			onDragLeave: e => {
				removeClass(tab, 'dragged-over');
				this.updateDropFeedback(tab, false, index);
			},

			onDragEnd: e => {
				removeClass(tab, 'dragged-over');
				this.updateDropFeedback(tab, false, index);

				this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			},

			onDrop: e => {
				removeClass(tab, 'dragged-over');
				this.updateDropFeedback(tab, false, index);

				this.onDrop(e, index, tabsContainer);
			}
		}));

		return disposables;
	}

	private isSupportedDropTransfer(e: DragEvent): boolean {
		if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
			const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
			if (Array.isArray(data)) {
				const group = data[0];
				if (group.identifier === this.group.id) {
					return false; // groups cannot be dropped on title area it originates from
				}
			}

			return true;
		}

		if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			return true; // (local) editors can always be dropped
		}

		if (e.dataTransfer && e.dataTransfer.types.length > 0) {
			return true; // optimistically allow external data (// see https://github.com/Microsoft/vscode/issues/25789)
		}

		return false;
	}

	private updateDropFeedback(element: HTMLElement, isDND: boolean, index?: number): void {
		const isTab = (typeof index === 'number');
		const editor = typeof index === 'number' ? this.group.getEditorByIndex(index) : undefined;
		const isActiveTab = isTab && !!editor && this.group.isActive(editor);

		// Background
		const noDNDBackgroundColor = isTab ? this.getColor(isActiveTab ? TAB_ACTIVE_BACKGROUND : TAB_INACTIVE_BACKGROUND) : '';
		element.style.backgroundColor = (isDND ? this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) : noDNDBackgroundColor) || '';

		// Outline
		const activeContrastBorderColor = this.getColor(activeContrastBorder);
		if (activeContrastBorderColor && isDND) {
			element.style.outlineWidth = '2px';
			element.style.outlineStyle = 'dashed';
			element.style.outlineColor = activeContrastBorderColor;
			element.style.outlineOffset = isTab ? '-5px' : '-3px';
		} else {
			element.style.outlineWidth = '';
			element.style.outlineStyle = '';
			element.style.outlineColor = activeContrastBorderColor || '';
			element.style.outlineOffset = '';
		}
	}

	private computeTabLabels(): void {
		const { labelFormat } = this.accessor.partOptions;
		const { verbosity, shortenDuplicates } = this.getLabelConfigFlags(labelFormat);

		// Build labels and descriptions for each editor
		const labels = this.group.editors.map(editor => ({
			editor,
			name: editor.getName(),
			description: editor.getDescription(verbosity),
			title: withNullAsUndefined(editor.getTitle(Verbosity.LONG))
		}));

		// Shorten labels as needed
		if (shortenDuplicates) {
			this.shortenTabLabels(labels);
		}

		this.tabLabels = labels;
	}

	private shortenTabLabels(labels: AugmentedLabel[]): void {

		// Gather duplicate titles, while filtering out invalid descriptions
		const mapTitleToDuplicates = new Map<string, AugmentedLabel[]>();
		for (const label of labels) {
			if (typeof label.description === 'string') {
				getOrSet(mapTitleToDuplicates, label.name, []).push(label);
			} else {
				label.description = '';
			}
		}

		// Identify duplicate titles and shorten descriptions
		mapTitleToDuplicates.forEach(duplicateTitles => {

			// Remove description if the title isn't duplicated
			if (duplicateTitles.length === 1) {
				duplicateTitles[0].description = '';

				return;
			}

			// Identify duplicate descriptions
			const mapDescriptionToDuplicates = new Map<string, AugmentedLabel[]>();
			for (const label of duplicateTitles) {
				getOrSet(mapDescriptionToDuplicates, label.description, []).push(label);
			}

			// For editors with duplicate descriptions, check whether any long descriptions differ
			let useLongDescriptions = false;
			mapDescriptionToDuplicates.forEach((duplicateDescriptions, name) => {
				if (!useLongDescriptions && duplicateDescriptions.length > 1) {
					const [first, ...rest] = duplicateDescriptions.map(({ editor }) => editor.getDescription(Verbosity.LONG));
					useLongDescriptions = rest.some(description => description !== first);
				}
			});

			// If so, replace all descriptions with long descriptions
			if (useLongDescriptions) {
				mapDescriptionToDuplicates.clear();
				duplicateTitles.forEach(label => {
					label.description = label.editor.getDescription(Verbosity.LONG);
					getOrSet(mapDescriptionToDuplicates, label.description, []).push(label);
				});
			}

			// Obtain final set of descriptions
			const descriptions: string[] = [];
			mapDescriptionToDuplicates.forEach((_, description) => descriptions.push(description));

			// Remove description if all descriptions are identical
			if (descriptions.length === 1) {
				for (const label of mapDescriptionToDuplicates.get(descriptions[0]) || []) {
					label.description = '';
				}

				return;
			}

			// Shorten descriptions
			const shortenedDescriptions = shorten(descriptions);
			descriptions.forEach((description, i) => {
				for (const label of mapDescriptionToDuplicates.get(description) || []) {
					label.description = shortenedDescriptions[i];
				}
			});
		});
	}

	private getLabelConfigFlags(value: string | undefined) {
		switch (value) {
			case 'short':
				return { verbosity: Verbosity.SHORT, shortenDuplicates: false };
			case 'medium':
				return { verbosity: Verbosity.MEDIUM, shortenDuplicates: false };
			case 'long':
				return { verbosity: Verbosity.LONG, shortenDuplicates: false };
			default:
				return { verbosity: Verbosity.MEDIUM, shortenDuplicates: true };
		}
	}

	private redraw(): void {

		// For each tab
		this.forEachTab((editor, index, tabContainer, tabLabelWidget, tabLabel) => {
			this.redrawTab(editor, index, tabContainer, tabLabelWidget, tabLabel);
		});

		// Don't need to show the adhsd container if there are no tabs in it.
		const adhsdContainer = assertIsDefined(this.adhsdContainer);
		if (this.group.getAdhsdCount() === 0) {
			adhsdContainer.style.display = 'none';
		}
		else {
			adhsdContainer.style.display = 'flex';
		}

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();

		// Ensure the active tab is always revealed
		this.layout(this.dimension);

		// Ensure that the height updates based on the number of rows to be displayed.
		this.group.relayout();
	}

	private redrawTab(editor: IEditorInput, index: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel): void {

		// Label
		this.redrawLabel(editor, tabContainer, tabLabelWidget, tabLabel);

		// Borders / Outline
		const borderRightColor = (this.getColor(TAB_BORDER) || this.getColor(contrastBorder));
		tabContainer.style.borderRight = borderRightColor ? `1px solid ${borderRightColor}` : '';
		tabContainer.style.outlineColor = this.getColor(activeContrastBorder) || '';

		// Settings
		const options = this.accessor.partOptions;

		if (this.group.isAdhsd(editor)) {
			const tabAdhs = tabContainer.getElementsByClassName('tab-adhs')[0] as HTMLElement;
			const tabUnadhs = tabContainer.getElementsByClassName('tab-unadhs')[0] as HTMLElement;
			addClass(tabAdhs, 'hidden');
			removeClass(tabUnadhs, 'hidden');
		}
		else {
			const tabAdhs = tabContainer.getElementsByClassName('tab-adhs')[0] as HTMLElement;
			const tabUnadhs = tabContainer.getElementsByClassName('tab-unadhs')[0] as HTMLElement;
			removeClass(tabAdhs, 'hidden');
			addClass(tabUnadhs, 'hidden');
		}

		['off', 'left', 'right'].forEach(option => {
			const domAction = options.tabCloseButton === option ? addClass : removeClass;
			domAction(tabContainer, `close-button-${option}`);
		});

		['fit', 'shrink'].forEach(option => {
			const domAction = options.tabSizing === option ? addClass : removeClass;
			domAction(tabContainer, `sizing-${option}`);
		});

		if (options.showIcons && !!options.iconTheme) {
			addClass(tabContainer, 'has-icon-theme');
		} else {
			removeClass(tabContainer, 'has-icon-theme');
		}

		// Active / dirty state
		this.redrawEditorActiveAndDirty(this.accessor.activeGroup === this.group, editor, tabContainer, tabLabelWidget);
	}

	private redrawLabel(editor: IEditorInput, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel): void {
		const name = tabLabel.name;
		const description = tabLabel.description || '';
		const title = tabLabel.title || '';

		// Container
		tabContainer.setAttribute('aria-label', `${name}, tab`);
		tabContainer.title = title;

		// Label
		tabLabelWidget.setResource({ name, description, resource: toResource(editor, { supportSideBySide: SideBySideEditor.MASTER }) }, { title, extraClasses: ['tab-label'], italic: !this.group.isPinned(editor) });
	}

	private redrawEditorActiveAndDirty(isGroupActive: boolean, editor: IEditorInput, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel): void {
		const isTabActive = this.group.isActive(editor);

		const hasModifiedBorderTop = this.doRedrawEditorDirty(isGroupActive, isTabActive, editor, tabContainer);

		this.doRedrawEditorActive(isGroupActive, !hasModifiedBorderTop, editor, tabContainer, tabLabelWidget);
	}

	private doRedrawEditorActive(isGroupActive: boolean, allowBorderTop: boolean, editor: IEditorInput, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel): void {

		// Tab is active
		if (this.group.isActive(editor)) {

			// Container
			addClass(tabContainer, 'active');
			tabContainer.setAttribute('aria-selected', 'true');
			tabContainer.style.backgroundColor = this.getColor(isGroupActive ? TAB_ACTIVE_BACKGROUND : TAB_UNFOCUSED_ACTIVE_BACKGROUND) || '';

			const activeTabBorderColorBottom = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER : TAB_UNFOCUSED_ACTIVE_BORDER);
			if (activeTabBorderColorBottom) {
				addClass(tabContainer, 'tab-border-bottom');
				tabContainer.style.setProperty('--tab-border-bottom-color', activeTabBorderColorBottom.toString());
			} else {
				removeClass(tabContainer, 'tab-border-bottom');
				tabContainer.style.removeProperty('--tab-border-bottom-color');
			}

			const activeTabBorderColorTop = allowBorderTop ? this.getColor(isGroupActive ? TAB_ACTIVE_BORDER_TOP : TAB_UNFOCUSED_ACTIVE_BORDER_TOP) : undefined;
			if (activeTabBorderColorTop) {
				addClass(tabContainer, 'tab-border-top');
				tabContainer.style.setProperty('--tab-border-top-color', activeTabBorderColorTop.toString());
			} else {
				removeClass(tabContainer, 'tab-border-top');
				tabContainer.style.removeProperty('--tab-border-top-color');
			}

			// Label
			tabLabelWidget.element.style.color = this.getColor(isGroupActive ? TAB_ACTIVE_FOREGROUND : TAB_UNFOCUSED_ACTIVE_FOREGROUND);
		}

		// Tab is inactive
		else {

			// Container
			removeClass(tabContainer, 'active');
			tabContainer.setAttribute('aria-selected', 'false');
			tabContainer.style.backgroundColor = this.getColor(TAB_INACTIVE_BACKGROUND) || '';
			tabContainer.style.boxShadow = '';

			// Label
			tabLabelWidget.element.style.color = this.getColor(isGroupActive ? TAB_INACTIVE_FOREGROUND : TAB_UNFOCUSED_INACTIVE_FOREGROUND);
		}
	}

	private doRedrawEditorDirty(isGroupActive: boolean, isTabActive: boolean, editor: IEditorInput, tabContainer: HTMLElement): boolean {
		let hasModifiedBorderColor = false;

		// Tab: dirty
		if (editor.isDirty()) {
			addClass(tabContainer, 'dirty');

			// Highlight modified tabs with a border if configured
			if (this.accessor.partOptions.highlightModifiedTabs) {
				let modifiedBorderColor: string | null;
				if (isGroupActive && isTabActive) {
					modifiedBorderColor = this.getColor(TAB_ACTIVE_MODIFIED_BORDER);
				} else if (isGroupActive && !isTabActive) {
					modifiedBorderColor = this.getColor(TAB_INACTIVE_MODIFIED_BORDER);
				} else if (!isGroupActive && isTabActive) {
					modifiedBorderColor = this.getColor(TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER);
				} else {
					modifiedBorderColor = this.getColor(TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER);
				}

				if (modifiedBorderColor) {
					hasModifiedBorderColor = true;

					addClass(tabContainer, 'dirty-border-top');
					tabContainer.style.setProperty('--tab-dirty-border-top-color', modifiedBorderColor);
				}
			} else {
				removeClass(tabContainer, 'dirty-border-top');
				tabContainer.style.removeProperty('--tab-dirty-border-top-color');
			}
		}

		// Tab: not dirty
		else {
			removeClass(tabContainer, 'dirty');

			removeClass(tabContainer, 'dirty-border-top');
			tabContainer.style.removeProperty('--tab-dirty-border-top-color');
		}

		return hasModifiedBorderColor;
	}

	layout(dimension: Dimension | undefined): void {
		this.dimension = dimension;

		const activeTab = this.group.activeEditor ? this.getTab(this.group.activeEditor) : undefined;
		if (!activeTab || !this.dimension) {
			return;
		}

		// The layout of tabs can be an expensive operation because we access DOM properties
		// that can result in the browser doing a full page layout to validate them. To buffer
		// this a little bit we try at least to schedule this work on the next animation frame.
		if (!this.layoutScheduled.value) {
			this.layoutScheduled.value = scheduleAtNextAnimationFrame(() => {
				const dimension = assertIsDefined(this.dimension);
				this.doLayout(dimension);

				this.layoutScheduled.clear();
			});
		}
	}

	private doLayout(dimension: Dimension): void {
		const activeTab = this.group.activeEditor ? this.getTab(this.group.activeEditor) : undefined;
		if (!activeTab) {
			return;
		}

		const [adhsdContainer, adhsntContainer, tabsScrollbar] = assertAllDefined(this.adhsdContainer, this.adhsntContainer, this.tabsScrollbar);

		if (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden()) {
			this.breadcrumbsControl.layout({ width: dimension.width, height: BreadcrumbsControl.HEIGHT });
			tabsScrollbar.getDomNode().style.height = `${dimension.height - BreadcrumbsControl.HEIGHT}px`;
		}

		const visibleContainerWidth = Math.max(adhsntContainer.offsetWidth, adhsdContainer.offsetWidth);
		const totalContainerWidth = Math.max(adhsntContainer.scrollWidth, adhsdContainer.scrollWidth);

		let activeTabPosX: number | undefined;
		let activeTabWidth: number | undefined;

		if (!this.blockRevealActiveTab) {
			activeTabPosX = activeTab.offsetLeft;
			activeTabWidth = activeTab.offsetWidth;
		}

		// Update scrollbar
		tabsScrollbar.setScrollDimensions({
			width: visibleContainerWidth,
			scrollWidth: totalContainerWidth
		});

		// Return now if we are blocked to reveal the active tab and clear flag
		if (this.blockRevealActiveTab || typeof activeTabPosX !== 'number' || typeof activeTabWidth !== 'number') {
			this.blockRevealActiveTab = false;
			return;
		}

		// Reveal the active one
		const containerScrollPosX = tabsScrollbar.getScrollPosition().scrollLeft;
		const activeTabFits = activeTabWidth <= visibleContainerWidth;

		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		// Note: only try to do this if we actually have enough width to give to show the tab fully!
		if (activeTabFits && containerScrollPosX + visibleContainerWidth < activeTabPosX + activeTabWidth) {
			tabsScrollbar.setScrollPosition({
				scrollLeft: containerScrollPosX + ((activeTabPosX + activeTabWidth) /* right corner of tab */ - (containerScrollPosX + visibleContainerWidth) /* right corner of view port */)
			});
		}

		// Tab is overlflowng to the left or does not fit: Scroll it into view to the left
		else if (containerScrollPosX > activeTabPosX || !activeTabFits) {
			tabsScrollbar.setScrollPosition({
				scrollLeft: activeTabPosX
			});
		}
	}

	// Count of the total number of tabs (including adhsd and adhsnt).
	private numTabs(): number {
		const [adhsdContainer, adhsntContainer] = assertAllDefined(this.adhsdContainer, this.adhsntContainer);
		return adhsdContainer.children.length + adhsntContainer.children.length;
	}

	private getTab(editor: IEditorInput): HTMLElement | undefined {
		const editorIndex = this.group.getIndexOfEditor(editor);
		if (editorIndex >= 0) {
			return this.getTabAtIndex(editorIndex);
		}

		return undefined;
	}

	private getTabAtIndex(index: number): HTMLElement {
		const adhsdContainer = assertIsDefined(this.adhsdContainer);
		if (index < adhsdContainer.children.length) {
			return adhsdContainer.children[index] as HTMLElement;
		}
		else {
			const adhsntContainer = assertIsDefined(this.adhsntContainer);
			return adhsntContainer.children[index - adhsdContainer.children.length] as HTMLElement;
		}
	}

	private removeTabAtIndex(index: number): void {
		this.getTabAtIndex(index).remove();
	}

	// Reparents an adhsd tab to the beginning of the adhsnt list.
	private reparentAdhsdToAdhsnt(tabContainer: HTMLElement): void {
		const [adhsntContainer, adhsdContainer] = assertAllDefined(this.adhsntContainer, this.adhsdContainer);
		adhsdContainer.removeChild(tabContainer);
		adhsntContainer.insertBefore(tabContainer, adhsntContainer.children[0]);
	}

	// Reparents an adhsnt tab to a particular index in the adhsd list.
	private reparentAdhsntToAdhsd(tabContainer: HTMLElement, index: number): void {
		const [adhsntContainer, adhsdContainer] = assertAllDefined(this.adhsntContainer, this.adhsdContainer);
		adhsntContainer.removeChild(tabContainer);
		adhsdContainer.insertBefore(tabContainer, adhsdContainer.children[index]);
	}

	private blockRevealActiveTabOnce(): void {

		// When closing tabs through the tab close button or gesture, the user
		// might want to rapidly close tabs in sequence and as such revealing
		// the active tab after each close would be annoying. As such we block
		// the automated revealing of the active tab once after the close is
		// triggered.
		this.blockRevealActiveTab = true;
	}

	private originatesFromTabActionBar(e: MouseEvent | GestureEvent): boolean {
		let element: HTMLElement;
		if (e instanceof MouseEvent) {
			element = (e.target || e.srcElement) as HTMLElement;
		} else {
			element = (e as GestureEvent).initialTarget as HTMLElement;
		}

		return !!findParentWithClass(element, 'action-item', 'tab');
	}

	private onDrop(e: DragEvent, targetIndex: number, tabsContainer: HTMLElement): void {
		EventHelper.stop(e, true);

		this.updateDropFeedback(tabsContainer, false);
		removeClass(tabsContainer, 'scroll');

		// Local Editor DND
		if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
			if (Array.isArray(data)) {
				const draggedEditor = data[0].identifier;
				const sourceGroup = this.accessor.getGroup(draggedEditor.groupId);

				if (sourceGroup) {

					// Move editor to target position and index
					if (this.isMoveOperation(e, draggedEditor.groupId)) {
						// Make sure to unadhs if it is adhsd
						if (this.isUnadhsOperation(sourceGroup, draggedEditor.editor, targetIndex)) {
							sourceGroup.group.decrementAdhsdCount();
							sourceGroup.moveEditor(draggedEditor.editor, this.group, { index: this.group === sourceGroup ? targetIndex - 1 : targetIndex });
							// Only need to reparent if moving within a group
							if (this.group === sourceGroup) {
								const adhsdContainer = assertIsDefined(this.adhsdContainer);
								this.reparentAdhsdToAdhsnt(adhsdContainer.lastChild as HTMLElement);
							}
							// If we also need to adhs, just do the reparenting.
							if (this.isAdhsOperation(sourceGroup, draggedEditor.editor, targetIndex, tabsContainer)) {
								const [adhsdContainer, adhsntContainer] = assertAllDefined(this.adhsdContainer, this.adhsntContainer);
								this.reparentAdhsntToAdhsd(adhsntContainer.children[0] as HTMLElement, adhsdContainer.children.length);
							}
						}
						// Adhs if dragging strictly into the adhsd list
						// (so dragging to the end of the adhsd list will result in an unadhsd editor)
						else if (this.isAdhsOperation(sourceGroup, draggedEditor.editor, targetIndex, tabsContainer)) {
							this.group.group.incrementAdhsdCount();
							sourceGroup.moveEditor(draggedEditor.editor, this.group, { index: targetIndex });
							const [adhsdContainer, adhsntContainer] = assertAllDefined(this.adhsdContainer, this.adhsntContainer);
							this.reparentAdhsntToAdhsd(adhsntContainer.children[0] as HTMLElement, adhsdContainer.children.length);
						}
						else {
							sourceGroup.moveEditor(draggedEditor.editor, this.group, { index: targetIndex });
						}

						// Need to redraw to change the number of rows displayed if necessary
						this.redraw();
					}

					// Copy editor to target position and index
					else {
						sourceGroup.copyEditor(draggedEditor.editor, this.group, { index: targetIndex });
					}
				}

				this.group.focus();
				this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			}
		}

		// Local Editor Group DND
		else if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
			const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
			if (data) {
				const sourceGroup = this.accessor.getGroup(data[0].identifier);

				if (sourceGroup) {
					const mergeGroupOptions: IMergeGroupOptions = { index: targetIndex };
					if (!this.isMoveOperation(e, sourceGroup.id)) {
						mergeGroupOptions.mode = MergeGroupMode.COPY_EDITORS;
					}

					if (targetIndex < this.group.getAdhsdCount()) {
						this.group.group.incrementAdhsdCountBy(sourceGroup.count);
					}

					this.accessor.mergeGroup(sourceGroup, this.group, mergeGroupOptions);
				}

				this.group.focus();
				this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
			}
		}

		// External DND
		else {
			const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false /* open workspace file as file if dropped */ });
			dropHandler.handleDrop(e, () => this.group, () => this.group.focus(), targetIndex);
		}
	}

	private isMoveOperation(e: DragEvent, source: GroupIdentifier) {
		const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

		return !isCopy || source === this.group.id;
	}

	private isUnadhsOperation(sourceGroup: IEditorGroupView, editor: IEditorInput, targetIndex: number) {
		// Moving groups - unadhs if editor was adhsd in sourceGroup
		if (sourceGroup !== this.group) {
			return sourceGroup.isAdhsd(editor);
		}
		// Moving within group - unadhs if editor was adhsd and targetIndex is in the adhsnt region.
		return this.group.isAdhsd(editor) && targetIndex >= this.group.getAdhsdCount();
	}

	private isAdhsOperation(sourceGroup: IEditorGroupView, editor: IEditorInput, targetIndex: number, tabsContainer: HTMLElement) {
		// Dropping directly into the adhsdContainer - check if index if <= adhsdCount
		if (tabsContainer === this.adhsdContainer) {
			return targetIndex <= this.group.getAdhsdCount();
		}

		// Moving groups - adhs if targetIndex is in the adhsd region.
		if (sourceGroup !== this.group) {
			return targetIndex < this.group.getAdhsdCount();
		}
		// Moving within group - adhs if editor was unadhsd and targetIndex is in the adhsd region.
		return !this.group.isAdhsd(editor) && targetIndex < this.group.getAdhsdCount();
	}

	dispose(): void {
		super.dispose();

		this.tabDisposables = dispose(this.tabDisposables);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	// Add border between tabs and breadcrumbs in high contrast mode.
	if (theme.type === HIGH_CONTRAST) {
		const borderColor = (theme.getColor(TAB_BORDER) || theme.getColor(contrastBorder));
		collector.addRule(`
		.monaco-workbench div.tabs-and-actions-container {
			border-bottom: 1px solid ${borderColor};
		}
		`);
	}
	// Styling with Outline color (e.g. high contrast theme)
	const activeContrastBorderColor = theme.getColor(activeContrastBorder);
	if (activeContrastBorderColor) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab.active,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab.active:hover  {
				outline: 1px solid;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab:hover  {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab.active > .tab-close .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab.active:hover > .tab-close .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab.dirty > .tab-close .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab:hover > .tab-close .action-label {
				opacity: 1 !important;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active > .tab-adhs .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active:hover > .tab-adhs .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.dirty > .tab-adhs .action-label {
				opacity: 1 !important;
			}
		`);
	}

	// High Contrast Border Color for Editor Actions
	const contrastBorderColor = theme.getColor(contrastBorder);
	if (contrastBorderColor) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .editor-actions {
				outline: 1px solid ${contrastBorderColor}
			}
		`);
	}

	// Hover Background
	const tabHoverBackground = theme.getColor(TAB_HOVER_BACKGROUND);
	if (tabHoverBackground) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container .tab:hover  {
				background-color: ${tabHoverBackground} !important;
			}
		`);
	}

	const tabUnfocusedHoverBackground = theme.getColor(TAB_UNFOCUSED_HOVER_BACKGROUND);
	if (tabUnfocusedHoverBackground) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab:hover  {
				background-color: ${tabUnfocusedHoverBackground} !important;
			}
		`);
	}

	// Hover Border
	const tabHoverBorder = theme.getColor(TAB_HOVER_BORDER);
	if (tabHoverBorder) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container .tab:hover  {
				box-shadow: ${tabHoverBorder} 0 -1px inset !important;
			}
		`);
	}

	const tabUnfocusedHoverBorder = theme.getColor(TAB_UNFOCUSED_HOVER_BORDER);
	if (tabUnfocusedHoverBorder) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container .tab:hover  {
				box-shadow: ${tabUnfocusedHoverBorder} 0 -1px inset !important;
			}
		`);
	}

	// Fade out styles via linear gradient (when tabs are set to shrink)
	if (theme.type !== 'hc') {
		const workbenchBackground = WORKBENCH_BACKGROUND(theme);
		const editorBackgroundColor = theme.getColor(editorBackground);
		const editorGroupHeaderTabsBackground = theme.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
		const editorDragAndDropBackground = theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND);

		let adjustedTabBackground: Color | undefined;
		if (editorGroupHeaderTabsBackground && editorBackgroundColor) {
			adjustedTabBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorBackgroundColor, workbenchBackground);
		}

		let adjustedTabDragBackground: Color | undefined;
		if (editorGroupHeaderTabsBackground && editorBackgroundColor && editorDragAndDropBackground && editorBackgroundColor) {
			adjustedTabDragBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorDragAndDropBackground, editorBackgroundColor, workbenchBackground);
		}

		// Adjust gradient for focused and unfocused hover background
		const makeTabHoverBackgroundRule = (color: Color, colorDrag: Color, hasFocus = false) => `
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? '.active' : ''} > .title .tabs-container .tab.sizing-shrink:not(.dragged):hover > .tab-label::after {
					background: linear-gradient(to left, ${color}, transparent) !important;
				}

				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? '.active' : ''} > .title .tabs-container .tab.sizing-shrink:not(.dragged):hover > .tab-label::after {
					background: linear-gradient(to left, ${colorDrag}, transparent) !important;
				}
		`;

		// Adjust gradient for (focused) hover background
		if (tabHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabHoverBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabHoverBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag, true));
		}

		// Adjust gradient for unfocused hover background
		if (tabUnfocusedHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabUnfocusedHoverBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabUnfocusedHoverBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag));
		}

		// Adjust gradient for drag and drop background
		if (editorDragAndDropBackground && adjustedTabDragBackground) {
			const adjustedColorDrag = editorDragAndDropBackground.flatten(adjustedTabDragBackground);
			collector.addRule(`
			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container .tab.sizing-shrink.dragged-over:not(.active):not(.dragged) > .tab-label::after,
			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container .tab.sizing-shrink.dragged-over:not(.dragged) > .tab-label::after {
				background: linear-gradient(to left, ${adjustedColorDrag}, transparent) !important;
			}
		`);
		}

		// Adjust gradient for active tab background (focused and unfocused editor groups)
		const makeTabActiveBackgroundRule = (color: Color, colorDrag: Color, hasFocus = false) => `
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? '.active' : ':not(.active)'} > .title .tabs-container .tab.sizing-shrink.active:not(.dragged) > .tab-label::after {
					background: linear-gradient(to left, ${color}, transparent);
				}

				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? '.active' : ':not(.active)'} > .title .tabs-container .tab.sizing-shrink.active:not(.dragged) > .tab-label::after {
					background: linear-gradient(to left, ${colorDrag}, transparent);
				}
		`;

		// Adjust gradient for unfocused active tab background
		const tabActiveBackground = theme.getColor(TAB_ACTIVE_BACKGROUND);
		if (tabActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabActiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabActiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabActiveBackgroundRule(adjustedColor, adjustedColorDrag, true));
		}

		// Adjust gradient for unfocused active tab background
		const tabUnfocusedActiveBackground = theme.getColor(TAB_UNFOCUSED_ACTIVE_BACKGROUND);
		if (tabUnfocusedActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabUnfocusedActiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabUnfocusedActiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabActiveBackgroundRule(adjustedColor, adjustedColorDrag));
		}

		// Adjust gradient for inactive tab background
		const tabInactiveBackground = theme.getColor(TAB_INACTIVE_BACKGROUND);
		if (tabInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabInactiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabInactiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(`
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container > .title .tabs-container .tab.sizing-shrink:not(.dragged) > .tab-label::after {
				background: linear-gradient(to left, ${adjustedColor}, transparent);
			}

			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container > .title .tabs-container .tab.sizing-shrink:not(.dragged) > .tab-label::after {
				background: linear-gradient(to left, ${adjustedColorDrag}, transparent);
			}
		`);
		}
	}
});
