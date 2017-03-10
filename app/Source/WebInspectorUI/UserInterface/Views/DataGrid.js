/*
 * Copyright (C) 2008, 2013-2016 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.DataGrid = class DataGrid extends WebInspector.View
{
    constructor(columnsData, editCallback, deleteCallback, preferredColumnOrder)
    {
        super();

        this.columns = new Map;
        this.orderedColumns = [];

        this._settingsIdentifier = null;
        this._sortColumnIdentifier = null;
        this._sortColumnIdentifierSetting = null;
        this._sortOrder = WebInspector.DataGrid.SortOrder.Indeterminate;
        this._sortOrderSetting = null;
        this._hiddenColumnSetting = null;
        this._columnChooserEnabled = false;
        this._headerVisible = true;

        this._rows = [];

        this.children = [];
        this.selectedNode = null;
        this.expandNodesWhenArrowing = false;
        this.root = true;
        this.hasChildren = false;
        this.expanded = true;
        this.revealed = true;
        this.selected = false;
        this.dataGrid = this;
        this.indentWidth = 15;
        this.rowHeight = 20;
        this.resizers = [];
        this._columnWidthsInitialized = false;
        this._scrollbarWidth = 0;

        this._cachedScrollTop = NaN;
        this._cachedScrollableOffsetHeight = NaN;
        this._previousRevealedRowCount = NaN;
        this._topDataTableMarginHeight = NaN;
        this._bottomDataTableMarginHeight = NaN;

        this._filterText = "";
        this._filterDelegate = null;
        this._filterDidModifyNodeWhileProcessingItems = false;

        this.element.className = "data-grid";
        this.element.tabIndex = 0;
        this.element.addEventListener("keydown", this._keyDown.bind(this), false);
        this.element.copyHandler = this;

        this._headerWrapperElement = document.createElement("div");
        this._headerWrapperElement.classList.add("header-wrapper");

        this._headerTableElement = document.createElement("table");
        this._headerTableElement.className = "header";
        this._headerWrapperElement.appendChild(this._headerTableElement);

        this._headerTableColumnGroupElement = this._headerTableElement.createChild("colgroup");
        this._headerTableBodyElement = this._headerTableElement.createChild("tbody");
        this._headerTableRowElement = this._headerTableBodyElement.createChild("tr");
        this._headerTableRowElement.addEventListener("contextmenu", this._contextMenuInHeader.bind(this), true);
        this._headerTableCellElements = new Map;

        this._scrollContainerElement = document.createElement("div");
        this._scrollContainerElement.className = "data-container";

        this._scrollListener = () => this._noteScrollPositionChanged();
        this._updateScrollListeners();

        this._topDataTableMarginElement = this._scrollContainerElement.createChild("div");

        this._dataTableElement = this._scrollContainerElement.createChild("table", "data");

        this._bottomDataTableMarginElement = this._scrollContainerElement.createChild("div");

        this._dataTableElement.addEventListener("mousedown", this._mouseDownInDataTable.bind(this));
        this._dataTableElement.addEventListener("click", this._clickInDataTable.bind(this));
        this._dataTableElement.addEventListener("contextmenu", this._contextMenuInDataTable.bind(this), true);

        // FIXME: Add a createCallback which is different from editCallback and has different
        // behavior when creating a new node.
        if (editCallback) {
            this._dataTableElement.addEventListener("dblclick", this._ondblclick.bind(this), false);
            this._editCallback = editCallback;
        }

        if (deleteCallback)
            this._deleteCallback = deleteCallback;

        this._dataTableColumnGroupElement = this._headerTableColumnGroupElement.cloneNode(true);
        this._dataTableElement.appendChild(this._dataTableColumnGroupElement);

        // This element is used by DataGridNodes to manipulate table rows and cells.
        this.dataTableBodyElement = this._dataTableElement.createChild("tbody");

        this._fillerRowElement = this.dataTableBodyElement.createChild("tr", "filler");

        this.element.appendChild(this._headerWrapperElement);
        this.element.appendChild(this._scrollContainerElement);

        if (preferredColumnOrder) {
            for (var columnIdentifier of preferredColumnOrder)
                this.insertColumn(columnIdentifier, columnsData[columnIdentifier]);
        } else {
            for (var columnIdentifier in columnsData)
                this.insertColumn(columnIdentifier, columnsData[columnIdentifier]);
        }

        this._updateScrollbarPadding();

        this._copyTextDelimiter = "\t";
    }

    _updateScrollbarPadding()
    {
        if (this._inline)
            return;

        let scrollbarWidth = this._scrollContainerElement.offsetWidth - this._scrollContainerElement.scrollWidth;
        if (this._scrollbarWidth === scrollbarWidth)
            return;

        this._headerWrapperElement.style.paddingRight = scrollbarWidth + "px";
        this._scrollbarWidth = scrollbarWidth;
    }

    static createSortableDataGrid(columnNames, values)
    {
        var numColumns = columnNames.length;
        if (!numColumns)
            return null;

        var columnsData = {};
        for (var columnName of columnNames) {
            columnsData[columnName] = {
                width: columnName.length,
                title: columnName,
                sortable: true,
            };
        }

        var dataGrid = new WebInspector.DataGrid(columnsData, undefined, undefined, columnNames);
        for (var i = 0; i < values.length / numColumns; ++i) {
            var data = {};
            for (var j = 0; j < columnNames.length; ++j)
                data[columnNames[j]] = values[numColumns * i + j];

            var node = new WebInspector.DataGridNode(data, false);
            dataGrid.appendChild(node);
        }

        function sortDataGrid()
        {
            var sortColumnIdentifier = dataGrid.sortColumnIdentifier;

            var columnIsNumeric = true;
            for (var node of dataGrid.children) {
                var value = dataGrid.textForDataGridNodeColumn(node, sortColumnIdentifier);
                if (isNaN(Number(value)))
                    columnIsNumeric = false;
            }

            function comparator(dataGridNode1, dataGridNode2)
            {
                var item1 = dataGrid.textForDataGridNodeColumn(dataGridNode1, sortColumnIdentifier);
                var item2 = dataGrid.textForDataGridNodeColumn(dataGridNode2, sortColumnIdentifier);

                var comparison;
                if (columnIsNumeric) {
                    var number1 = parseFloat(item1);
                    var number2 = parseFloat(item2);
                    comparison = number1 < number2 ? -1 : (number1 > number2 ? 1 : 0);
                } else
                    comparison = item1 < item2 ? -1 : (item1 > item2 ? 1 : 0);

                return comparison;
            }

            dataGrid.sortNodes(comparator);
        }

        dataGrid.addEventListener(WebInspector.DataGrid.Event.SortChanged, sortDataGrid, this);

        dataGrid.sortOrder = WebInspector.DataGrid.SortOrder.Ascending;
        dataGrid.sortColumnIdentifier = columnNames[0];

        return dataGrid;
    }

    get headerVisible() { return this._headerVisible; }

    set headerVisible(x)
    {
        if (x === this._headerVisible)
            return;

        this._headerVisible = x;
        this.element.classList.toggle("no-header", !this._headerVisible);
    }

    get columnChooserEnabled() { return this._columnChooserEnabled; }
    set columnChooserEnabled(x) { this._columnChooserEnabled = x; }

    get refreshCallback()
    {
        return this._refreshCallback;
    }

    set refreshCallback(refreshCallback)
    {
        this._refreshCallback = refreshCallback;
    }

    get sortOrder()
    {
        return this._sortOrder;
    }

    set sortOrder(order)
    {
        if (!order || order === this._sortOrder)
            return;

        this._sortOrder = order;

        if (this._sortOrderSetting)
            this._sortOrderSetting.value = this._sortOrder;

        if (!this._sortColumnIdentifier)
            return;

        var sortHeaderCellElement = this._headerTableCellElements.get(this._sortColumnIdentifier);

        sortHeaderCellElement.classList.toggle(WebInspector.DataGrid.SortColumnAscendingStyleClassName, this._sortOrder === WebInspector.DataGrid.SortOrder.Ascending);
        sortHeaderCellElement.classList.toggle(WebInspector.DataGrid.SortColumnDescendingStyleClassName, this._sortOrder === WebInspector.DataGrid.SortOrder.Descending);

        this.dispatchEventToListeners(WebInspector.DataGrid.Event.SortChanged);
    }

    get sortColumnIdentifier()
    {
        return this._sortColumnIdentifier;
    }

    set sortColumnIdentifier(columnIdentifier)
    {
        console.assert(columnIdentifier && this.columns.has(columnIdentifier));
        console.assert("sortable" in this.columns.get(columnIdentifier));

        if (this._sortColumnIdentifier === columnIdentifier)
            return;

        let oldSortColumnIdentifier = this._sortColumnIdentifier;
        this._sortColumnIdentifier = columnIdentifier;
        this._updateSortedColumn(oldSortColumnIdentifier);
    }

    get inline() { return this._inline; }

    set inline(x)
    {
        if (this._inline === x)
            return;

        this._inline = x || false;

        this._element.classList.toggle("inline", this._inline);

        this._updateScrollListeners();
    }

    get variableHeightRows() { return this._variableHeightRows; }

    set variableHeightRows(x)
    {
        if (this._variableHeightRows === x)
            return;

        this._variableHeightRows = x || false;

        this._element.classList.toggle("variable-height-rows", this._variableHeightRows);

        this._updateScrollListeners();
    }

    get filterText() { return this._filterText; }

    set filterText(x)
    {
        if (this._filterText === x)
            return;

        this._filterText = x;
        this.filterDidChange();
    }

    get filterDelegate() { return this._filterDelegate; }

    set filterDelegate(delegate)
    {
        this._filterDelegate = delegate;
        this.filterDidChange();
    }

    filterDidChange()
    {
        if (this._scheduledFilterUpdateIdentifier)
            return;

        if (this._applyFilterToNodesTask) {
            this._applyFilterToNodesTask.cancel();
            this._applyFilterToNodesTask = null;
        }

        this._scheduledFilterUpdateIdentifier = requestAnimationFrame(this._updateFilter.bind(this));
    }

    hasFilters()
    {
        return this._textFilterRegex || this._hasFilterDelegate();
    }

    matchNodeAgainstCustomFilters(node)
    {
        if (!this._hasFilterDelegate())
            return true;
        return this._filterDelegate.dataGridMatchNodeAgainstCustomFilters(node);
    }

    createSettings(identifier)
    {
        console.assert(identifier && typeof identifier === "string");
        if (this._settingsIdentifier === identifier)
            return;

        this._settingsIdentifier = identifier;

        this._sortColumnIdentifierSetting = new WebInspector.Setting(this._settingsIdentifier + "-sort", this._sortColumnIdentifier);
        this._sortOrderSetting = new WebInspector.Setting(this._settingsIdentifier + "-sort-order", this._sortOrder);
        this._hiddenColumnSetting = new WebInspector.Setting(this._settingsIdentifier + "-hidden-columns", []);

        if (!this.columns)
            return;

        if (this._sortColumnIdentifierSetting.value) {
            this.sortColumnIdentifier = this._sortColumnIdentifierSetting.value;
            this.sortOrder = this._sortOrderSetting.value;
        }

        for (let columnIdentifier of this._hiddenColumnSetting.value)
            this.setColumnVisible(columnIdentifier, false);
    }

    _updateScrollListeners()
    {
        if (this._inline || this._variableHeightRows) {
            this._scrollContainerElement.removeEventListener("scroll", this._scrollListener);
            this._scrollContainerElement.removeEventListener("mousewheel", this._scrollListener);
        } else {
            this._scrollContainerElement.addEventListener("scroll", this._scrollListener);
            this._scrollContainerElement.addEventListener("mousewheel", this._scrollListener);
        }
    }

    _applyFiltersToNodeAndDispatchEvent(node)
    {
        const nodeWasHidden = node.hidden;
        this._applyFiltersToNode(node);
        if (nodeWasHidden !== node.hidden)
            this.dispatchEventToListeners(WebInspector.DataGrid.Event.NodeWasFiltered, {node});

        return nodeWasHidden !== node.hidden;
    }

    _applyFiltersToNode(node)
    {
        if (!this.hasFilters()) {
            // No filters, so make everything visible.
            node.hidden = false;

            // If the node was expanded during filtering, collapse it again.
            if (node.expanded && node[WebInspector.DataGrid.WasExpandedDuringFilteringSymbol]) {
                node[WebInspector.DataGrid.WasExpandedDuringFilteringSymbol] = false;
                node.collapse();
            }

            return;
        }

        let filterableData = node.filterableData || [];
        let flags = {expandNode: false};
        let filterRegex = this._textFilterRegex;

        function matchTextFilter()
        {
            if (!filterableData.length || !filterRegex)
                return true;

            if (filterableData.some((value) => filterRegex.test(value))) {
                flags.expandNode = true;
                return true;
            }

            return false;
        }

        function makeVisible()
        {
            // Make this element visible.
            node.hidden = false;

            // Make the ancestors visible and expand them.
            let currentAncestor = node.parent;
            while (currentAncestor && !currentAncestor.root) {
                currentAncestor.hidden = false;

                // Only expand if the built-in filters matched, not custom filters.
                if (flags.expandNode && !currentAncestor.expanded) {
                    currentAncestor[WebInspector.DataGrid.WasExpandedDuringFilteringSymbol] = true;
                    currentAncestor.expand();
                }

                currentAncestor = currentAncestor.parent;
            }
        }

        if (matchTextFilter() && this.matchNodeAgainstCustomFilters(node)) {
            // Make the node visible since it matches.
            makeVisible();

            // If the node didn't match a built-in filter and was expanded earlier during filtering, collapse it again.
            if (!flags.expandNode && node.expanded && node[WebInspector.DataGrid.WasExpandedDuringFilteringSymbol]) {
                node[WebInspector.DataGrid.WasExpandedDuringFilteringSymbol] = false;
                node.collapse();
            }

            return;
        }

        // Make the node invisible since it does not match.
        node.hidden = true;
    }

    _updateSortedColumn(oldSortColumnIdentifier)
    {
        if (this._sortColumnIdentifierSetting)
            this._sortColumnIdentifierSetting.value = this._sortColumnIdentifier;

        if (oldSortColumnIdentifier) {
            let oldSortHeaderCellElement = this._headerTableCellElements.get(oldSortColumnIdentifier);
            oldSortHeaderCellElement.classList.remove(WebInspector.DataGrid.SortColumnAscendingStyleClassName);
            oldSortHeaderCellElement.classList.remove(WebInspector.DataGrid.SortColumnDescendingStyleClassName);
        }

        if (this._sortColumnIdentifier) {
            let newSortHeaderCellElement = this._headerTableCellElements.get(this._sortColumnIdentifier);
            newSortHeaderCellElement.classList.toggle(WebInspector.DataGrid.SortColumnAscendingStyleClassName, this._sortOrder === WebInspector.DataGrid.SortOrder.Ascending);
            newSortHeaderCellElement.classList.toggle(WebInspector.DataGrid.SortColumnDescendingStyleClassName, this._sortOrder === WebInspector.DataGrid.SortOrder.Descending);
        }

        this.dispatchEventToListeners(WebInspector.DataGrid.Event.SortChanged);
    }

    _hasFilterDelegate()
    {
        return this._filterDelegate && typeof this._filterDelegate.dataGridMatchNodeAgainstCustomFilters === "function";
    }

    _ondblclick(event)
    {
        if (this._editing || this._editingNode)
            return;

        this._startEditing(event.target);
    }

    _startEditingNodeAtColumnIndex(node, columnIndex)
    {
        console.assert(node, "Invalid argument: must provide DataGridNode to edit.");

        this._editing = true;
        this._editingNode = node;
        this._editingNode.select();

        var element = this._editingNode._element.children[columnIndex];
        WebInspector.startEditing(element, this._startEditingConfig(element));
        window.getSelection().setBaseAndExtent(element, 0, element, 1);
    }

    _startEditing(target)
    {
        var element = target.enclosingNodeOrSelfWithNodeName("td");
        if (!element)
            return;

        this._editingNode = this.dataGridNodeFromNode(target);
        if (!this._editingNode) {
            if (!this.placeholderNode)
                return;
            this._editingNode = this.placeholderNode;
        }

        // Force editing the 1st column when editing the placeholder node
        if (this._editingNode.isPlaceholderNode)
            return this._startEditingNodeAtColumnIndex(this._editingNode, 0);

        this._editing = true;
        WebInspector.startEditing(element, this._startEditingConfig(element));

        window.getSelection().setBaseAndExtent(element, 0, element, 1);
    }

    _startEditingConfig(element)
    {
        return new WebInspector.EditingConfig(this._editingCommitted.bind(this), this._editingCancelled.bind(this), element.textContent);
    }

    _editingCommitted(element, newText, oldText, context, moveDirection)
    {
        var columnIdentifier = element.__columnIdentifier;
        var columnIndex = this.orderedColumns.indexOf(columnIdentifier);

        var textBeforeEditing = this._editingNode.data[columnIdentifier] || "";
        var currentEditingNode = this._editingNode;

        // Returns an object with the next node and column index to edit, and whether it
        // is an appropriate time to re-sort the table rows. When editing, we want to
        // postpone sorting until we switch rows or wrap around a row.
        function determineNextCell(valueDidChange) {
            if (moveDirection === "forward") {
                if (columnIndex < this.orderedColumns.length - 1)
                    return {shouldSort: false, editingNode: currentEditingNode, columnIndex: columnIndex + 1};

                // Continue by editing the first column of the next row if it exists.
                var nextDataGridNode = currentEditingNode.traverseNextNode(true, null, true);
                return {shouldSort: true, editingNode: nextDataGridNode || currentEditingNode, columnIndex: 0};
            }

            if (moveDirection === "backward") {
                if (columnIndex > 0)
                    return {shouldSort: false, editingNode: currentEditingNode, columnIndex: columnIndex - 1};

                var previousDataGridNode = currentEditingNode.traversePreviousNode(true, null, true);
                return {shouldSort: true, editingNode: previousDataGridNode || currentEditingNode, columnIndex: this.orderedColumns.length - 1};
            }

            // If we are not moving in any direction, then sort and stop.
            return {shouldSort: true};
        }

        function moveToNextCell(valueDidChange) {
            var moveCommand = determineNextCell.call(this, valueDidChange);
            if (moveCommand.shouldSort && this._sortAfterEditingCallback) {
                this._sortAfterEditingCallback();
                this._sortAfterEditingCallback = null;
            }
            if (moveCommand.editingNode)
                this._startEditingNodeAtColumnIndex(moveCommand.editingNode, moveCommand.columnIndex);
        }

        this._editingCancelled(element);

        // Update table's data model, and delegate to the callback to update other models.
        currentEditingNode.data[columnIdentifier] = newText.trim();
        this._editCallback(currentEditingNode, columnIdentifier, textBeforeEditing, newText, moveDirection);

        var textDidChange = textBeforeEditing.trim() !== newText.trim();
        moveToNextCell.call(this, textDidChange);
    }

    _editingCancelled(element)
    {
        console.assert(this._editingNode.element === element.enclosingNodeOrSelfWithNodeName("tr"));
        this._editing = false;
        this._editingNode = null;
    }

    autoSizeColumns(minPercent, maxPercent, maxDescentLevel)
    {
        if (minPercent)
            minPercent = Math.min(minPercent, Math.floor(100 / this.orderedColumns.length));
        var widths = {};
        // For the first width approximation, use the character length of column titles.
        for (var [identifier, column] of this.columns)
            widths[identifier] = (column["title"] || "").length;

        // Now approximate the width of each column as max(title, cells).
        var children = maxDescentLevel ? this._enumerateChildren(this, [], maxDescentLevel + 1) : this.children;
        for (var node of children) {
            for (var identifier of this.columns.keys()) {
                var text = this.textForDataGridNodeColumn(node, identifier);
                if (text.length > widths[identifier])
                    widths[identifier] = text.length;
            }
        }

        var totalColumnWidths = 0;
        for (var identifier of this.columns.keys())
            totalColumnWidths += widths[identifier];

        // Compute percentages and clamp desired widths to min and max widths.
        var recoupPercent = 0;
        for (var identifier of this.columns.keys()) {
            var width = Math.round(100 * widths[identifier] / totalColumnWidths);
            if (minPercent && width < minPercent) {
                recoupPercent += (minPercent - width);
                width = minPercent;
            } else if (maxPercent && width > maxPercent) {
                recoupPercent -= (width - maxPercent);
                width = maxPercent;
            }
            widths[identifier] = width;
        }

        // If we assigned too much width due to the above, reduce column widths.
        while (minPercent && recoupPercent > 0) {
            for (var identifier of this.columns.keys()) {
                if (widths[identifier] > minPercent) {
                    --widths[identifier];
                    --recoupPercent;
                    if (!recoupPercent)
                        break;
                }
            }
        }

        // If extra width remains after clamping widths, expand column widths.
        while (maxPercent && recoupPercent < 0) {
            for (var identifier of this.columns.keys()) {
                if (widths[identifier] < maxPercent) {
                    ++widths[identifier];
                    ++recoupPercent;
                    if (!recoupPercent)
                        break;
                }
            }
        }

        for (var [identifier, column] of this.columns) {
            column["element"].style.width = widths[identifier] + "%";
            column["bodyElement"].style.width = widths[identifier] + "%";
        }

        this._columnWidthsInitialized = false;
        this.needsLayout();
    }

    insertColumn(columnIdentifier, columnData, insertionIndex)
    {
        if (insertionIndex === undefined)
            insertionIndex = this.orderedColumns.length;
        insertionIndex = Number.constrain(insertionIndex, 0, this.orderedColumns.length);

        var listeners = new WebInspector.EventListenerSet(this, "DataGrid column DOM listeners");

        // Copy configuration properties instead of keeping a reference to the passed-in object.
        var column = Object.shallowCopy(columnData);
        column["listeners"] = listeners;
        column["ordinal"] = insertionIndex;
        column["columnIdentifier"] = columnIdentifier;

        this.orderedColumns.splice(insertionIndex, 0, columnIdentifier);

        for (var [identifier, existingColumn] of this.columns) {
            var ordinal = existingColumn["ordinal"];
            if (ordinal >= insertionIndex) // Also adjust the "old" column at insertion index.
                existingColumn["ordinal"] = ordinal + 1;
        }
        this.columns.set(columnIdentifier, column);

        if (column["disclosure"])
            this.disclosureColumnIdentifier = columnIdentifier;

        var headerColumnElement = document.createElement("col");
        if (column["width"])
            headerColumnElement.style.width = column["width"];
        column["element"] = headerColumnElement;
        var referenceElement = this._headerTableColumnGroupElement.children[insertionIndex];
        this._headerTableColumnGroupElement.insertBefore(headerColumnElement, referenceElement);

        var headerCellElement = document.createElement("th");
        headerCellElement.className = columnIdentifier + "-column";
        headerCellElement.columnIdentifier = columnIdentifier;
        if (column["aligned"])
            headerCellElement.classList.add(column["aligned"]);
        this._headerTableCellElements.set(columnIdentifier, headerCellElement);
        var referenceElement = this._headerTableRowElement.children[insertionIndex];
        this._headerTableRowElement.insertBefore(headerCellElement, referenceElement);

        if (column["headerView"]) {
            let headerView = column["headerView"];
            console.assert(headerView instanceof WebInspector.View);

            headerCellElement.appendChild(headerView.element);
            this.addSubview(headerView);
        } else {
            let titleElement = headerCellElement.createChild("div");
            if (column["titleDOMFragment"])
                titleElement.appendChild(column["titleDOMFragment"]);
            else
                titleElement.textContent = column["title"] || "";
        }

        if (column["sortable"]) {
            listeners.register(headerCellElement, "click", this._headerCellClicked);
            headerCellElement.classList.add(WebInspector.DataGrid.SortableColumnStyleClassName);
        }

        if (column["group"])
            headerCellElement.classList.add("column-group-" + column["group"]);

        if (column["tooltip"])
            headerCellElement.title = column["tooltip"];

        if (column["collapsesGroup"]) {
            console.assert(column["group"] !== column["collapsesGroup"]);

            headerCellElement.createChild("div", "divider");

            var collapseDiv = headerCellElement.createChild("div", "collapser-button");
            collapseDiv.title = this._collapserButtonCollapseColumnsToolTip();
            listeners.register(collapseDiv, "mouseover", this._mouseoverColumnCollapser);
            listeners.register(collapseDiv, "mouseout", this._mouseoutColumnCollapser);
            listeners.register(collapseDiv, "click", this._clickInColumnCollapser);

            headerCellElement.collapsesGroup = column["collapsesGroup"];
            headerCellElement.classList.add("collapser");
        }

        this._headerTableColumnGroupElement.span = this.orderedColumns.length;

        var dataColumnElement = headerColumnElement.cloneNode();
        var referenceElement = this._dataTableColumnGroupElement.children[insertionIndex];
        this._dataTableColumnGroupElement.insertBefore(dataColumnElement, referenceElement);
        column["bodyElement"] = dataColumnElement;

        var fillerCellElement = document.createElement("td");
        fillerCellElement.className = columnIdentifier + "-column";
        fillerCellElement.__columnIdentifier = columnIdentifier;
        if (column["group"])
            fillerCellElement.classList.add("column-group-" + column["group"]);
        var referenceElement = this._fillerRowElement.children[insertionIndex];
        this._fillerRowElement.insertBefore(fillerCellElement, referenceElement);

        listeners.install();

        this.setColumnVisible(columnIdentifier, !column.hidden);
    }

    removeColumn(columnIdentifier)
    {
        console.assert(this.columns.has(columnIdentifier));
        var removedColumn = this.columns.get(columnIdentifier);
        this.columns.delete(columnIdentifier);
        this.orderedColumns.splice(this.orderedColumns.indexOf(columnIdentifier), 1);

        var removedOrdinal = removedColumn["ordinal"];
        for (var [identifier, column] of this.columns) {
            var ordinal = column["ordinal"];
            if (ordinal > removedOrdinal)
                column["ordinal"] = ordinal - 1;
        }

        removedColumn["listeners"].uninstall(true);

        if (removedColumn["disclosure"])
            this.disclosureColumnIdentifier = undefined;

        if (this.sortColumnIdentifier === columnIdentifier)
            this.sortColumnIdentifier = null;

        this._headerTableCellElements.delete(columnIdentifier);
        this._headerTableRowElement.children[removedOrdinal].remove();
        this._headerTableColumnGroupElement.children[removedOrdinal].remove();
        this._dataTableColumnGroupElement.children[removedOrdinal].remove();
        this._fillerRowElement.children[removedOrdinal].remove();

        this._headerTableColumnGroupElement.span = this.orderedColumns.length;

        for (var child of this.children)
            child.refresh();
    }

    _enumerateChildren(rootNode, result, maxLevel)
    {
        if (!rootNode.root)
            result.push(rootNode);
        if (!maxLevel)
            return;
        for (var i = 0; i < rootNode.children.length; ++i)
            this._enumerateChildren(rootNode.children[i], result, maxLevel - 1);
        return result;
    }

    // Updates the widths of the table, including the positions of the column
    // resizers.
    //
    // IMPORTANT: This function MUST be called once after the element of the
    // DataGrid is attached to its parent element and every subsequent time the
    // width of the parent element is changed in order to make it possible to
    // resize the columns.
    //
    // If this function is not called after the DataGrid is attached to its
    // parent element, then the DataGrid's columns will not be resizable.
    layout()
    {
        // Do not attempt to use offsets if we're not attached to the document tree yet.
        if (!this._columnWidthsInitialized && this.element.offsetWidth) {
            // Give all the columns initial widths now so that during a resize,
            // when the two columns that get resized get a percent value for
            // their widths, all the other columns already have percent values
            // for their widths.
            let headerTableColumnElements = this._headerTableColumnGroupElement.children;
            let tableWidth = this._dataTableElement.offsetWidth;
            let numColumns = headerTableColumnElements.length;
            let cells = this._headerTableBodyElement.rows[0].cells;

            // Calculate widths.
            let columnWidths = [];
            for (let i = 0; i < numColumns; ++i) {
                let headerCellElement = cells[i];
                if (this._isColumnVisible(headerCellElement.columnIdentifier)) {
                    let columnWidth = headerCellElement.offsetWidth;
                    let percentWidth = ((columnWidth / tableWidth) * 100) + "%";
                    columnWidths.push(percentWidth);
                } else
                    columnWidths.push(0);
            }

            // Apply widths.
            for (let i = 0; i < numColumns; i++) {
                let percentWidth = columnWidths[i];
                this._headerTableColumnGroupElement.children[i].style.width = percentWidth;
                this._dataTableColumnGroupElement.children[i].style.width = percentWidth;
            }

            this._columnWidthsInitialized = true;
            this._updateHeaderAndScrollbar();
        }

        this._updateVisibleRows();
    }

    sizeDidChange()
    {
        this._updateHeaderAndScrollbar();
    }

    _updateHeaderAndScrollbar()
    {
        this._positionResizerElements();
        this._positionHeaderViews();
        this._updateScrollbarPadding();

        this._cachedScrollTop = NaN;
        this._cachedScrollableOffsetHeight = NaN;
    }

    columnWidthsMap()
    {
        var result = {};
        for (var [identifier, column] of this.columns) {
            var width = this._headerTableColumnGroupElement.children[column["ordinal"]].style.width;
            result[identifier] = parseFloat(width);
        }
        return result;
    }

    applyColumnWidthsMap(columnWidthsMap)
    {
        for (var [identifier, column] of this.columns) {
            var width = (columnWidthsMap[identifier] || 0) + "%";
            var ordinal = column["ordinal"];
            this._headerTableColumnGroupElement.children[ordinal].style.width = width;
            this._dataTableColumnGroupElement.children[ordinal].style.width = width;
        }

        this.needsLayout();
    }

    _isColumnVisible(columnIdentifier)
    {
        return !this.columns.get(columnIdentifier)["hidden"];
    }

    setColumnVisible(columnIdentifier, visible)
    {
        let column = this.columns.get(columnIdentifier);
        console.assert(column, "Missing column info for identifier: " + columnIdentifier);

        if (!column || visible === !column.hidden)
            return;

        column.element.style.width = visible ? column.width : 0;
        column.hidden = !visible;

        if (this._hiddenColumnSetting) {
            let hiddenColumns = this._hiddenColumnSetting.value.slice();
            if (column.hidden)
                hiddenColumns.push(columnIdentifier);
            else
                hiddenColumns.remove(columnIdentifier);

            this._hiddenColumnSetting.value = hiddenColumns;
        }

        this._columnWidthsInitialized = false;
        this.updateLayout();
    }

    get scrollContainer()
    {
        return this._scrollContainerElement;
    }

    isScrolledToLastRow()
    {
        return this._scrollContainerElement.isScrolledToBottom();
    }

    scrollToLastRow()
    {
        this._scrollContainerElement.scrollTop = this._scrollContainerElement.scrollHeight - this._scrollContainerElement.offsetHeight;
    }

    _positionResizerElements()
    {
        let leadingOffset = 0;
        var previousResizer = null;

        // Make n - 1 resizers for n columns.
        var numResizers = this.orderedColumns.length - 1;

        // Calculate leading offsets.
        // Get the width of the cell in the first (and only) row of the
        // header table in order to determine the width of the column, since
        // it is not possible to query a column for its width.
        var cells = this._headerTableBodyElement.rows[0].cells;
        var columnWidths = [];
        for (var i = 0; i < numResizers; ++i) {
            leadingOffset += cells[i].getBoundingClientRect().width;
            columnWidths.push(leadingOffset);
        }

        // Apply leading offsets.
        for (var i = 0; i < numResizers; ++i) {
            // Create a new resizer if one does not exist for this column.
            // This resizer is associated with the column to its right.
            var resizer = this.resizers[i];
            if (!resizer) {
                resizer = this.resizers[i] = new WebInspector.Resizer(WebInspector.Resizer.RuleOrientation.Vertical, this);
                this.element.appendChild(resizer.element);
            }

            leadingOffset = columnWidths[i];

            if (this._isColumnVisible(this.orderedColumns[i])) {
                resizer.element.style.removeProperty("display");
                resizer.element.style.setProperty(WebInspector.resolvedLayoutDirection() === WebInspector.LayoutDirection.RTL ? "right" : "left", `${leadingOffset}px`);
                resizer[WebInspector.DataGrid.PreviousColumnOrdinalSymbol] = i;
                if (previousResizer)
                    previousResizer[WebInspector.DataGrid.NextColumnOrdinalSymbol] = i;
                previousResizer = resizer;
            } else {
                resizer.element.style.setProperty("display", "none");
                resizer[WebInspector.DataGrid.PreviousColumnOrdinalSymbol] = 0;
                resizer[WebInspector.DataGrid.NextColumnOrdinalSymbol] = 0;
            }
        }
        if (previousResizer)
            previousResizer[WebInspector.DataGrid.NextColumnOrdinalSymbol] = this.orderedColumns.length - 1;
    }

    _positionHeaderViews()
    {
        let leadingOffset = 0;
        let headerViews = [];
        let offsets = [];
        let columnWidths = [];

        // Calculate leading offsets and widths.
        for (let columnIdentifier of this.orderedColumns) {
            let column = this.columns.get(columnIdentifier);
            console.assert(column, "Missing column data for header cell with columnIdentifier " + columnIdentifier);
            if (!column)
                continue;

            let columnWidth = this._headerTableCellElements.get(columnIdentifier).offsetWidth;
            let headerView = column["headerView"];
            if (headerView) {
                headerViews.push(headerView);
                offsets.push(leadingOffset);
                columnWidths.push(columnWidth);
            }

            leadingOffset += columnWidth;
        }

        // Apply leading offsets and widths.
        for (let i = 0; i < headerViews.length; ++i) {
            let headerView = headerViews[i];
            headerView.element.style.setProperty(WebInspector.resolvedLayoutDirection() === WebInspector.LayoutDirection.RTL ? "right" : "left", `${offsets[i]}px`);
            headerView.element.style.width = columnWidths[i] + "px";
            headerView.updateLayout(WebInspector.View.LayoutReason.Resize);
        }
    }

    _noteRowsChanged()
    {
        this._previousRevealedRowCount = NaN;

        this.needsLayout();
    }

    _noteRowRemoved(dataGridNode)
    {
        if (this._inline || this._variableHeightRows) {
            // Inline DataGrids rows are not updated in layout, so
            // we need to remove rows immediately.
            if (dataGridNode.element && dataGridNode.element.parentNode)
                dataGridNode.element.parentNode.removeChild(dataGridNode.element);
            return;
        }

        this._noteRowsChanged();
    }

    _noteScrollPositionChanged()
    {
        this._cachedScrollTop = NaN;

        this.needsLayout();
    }

    _updateVisibleRows()
    {
        if (this._inline || this._variableHeightRows) {
            // Inline DataGrids always show all their rows, so we can't virtualize them.
            // In general, inline DataGrids usually have a small number of rows.

            // FIXME: This is a slow path for variable height rows that is similar to the old
            // non-virtualized DataGrid. Ideally we would track row height per-DataGridNode
            // and then we could virtualize even those cases. Currently variable height row
            // DataGrids don't usually have many rows, other than IndexedDB.

            let nextElement = this.dataTableBodyElement.lastChild;
            for (let i = this._rows.length - 1; i >= 0; --i) {
                let rowElement = this._rows[i].element;
                if (rowElement.nextSibling !== nextElement)
                    this.dataTableBodyElement.insertBefore(rowElement, nextElement);
                nextElement = rowElement;
            }

            return;
        }

        let rowHeight = this.rowHeight;
        let updateOffsetThreshold = rowHeight * 5;
        let overflowPadding = updateOffsetThreshold * 3;

        if (isNaN(this._cachedScrollTop))
            this._cachedScrollTop = this._scrollContainerElement.scrollTop;

        if (isNaN(this._cachedScrollableOffsetHeight))
            this._cachedScrollableOffsetHeight = this._scrollContainerElement.offsetHeight;

        let scrollTop = this._cachedScrollTop;
        let scrollableOffsetHeight = this._cachedScrollableOffsetHeight;

        let visibleRowCount = Math.ceil((scrollableOffsetHeight + (overflowPadding * 2)) / rowHeight);

        let currentTopMargin = this._topDataTableMarginHeight;
        let currentBottomMargin = this._bottomDataTableMarginHeight;
        let currentTableBottom = currentTopMargin + (visibleRowCount * rowHeight);

        let belowTopThreshold = !currentTopMargin || scrollTop > currentTopMargin + updateOffsetThreshold;
        let aboveBottomThreshold = !currentBottomMargin || scrollTop + scrollableOffsetHeight < currentTableBottom - updateOffsetThreshold;

        if (belowTopThreshold && aboveBottomThreshold && !isNaN(this._previousRevealedRowCount))
            return;

        let revealedRows = this._rows.filter((row) => row.revealed && !row.hidden);

        this._previousRevealedRowCount = revealedRows.length;

        let topHiddenRowCount = Math.max(0, Math.floor((scrollTop - overflowPadding) / rowHeight));
        let bottomHiddenRowCount = Math.max(0, this._previousRevealedRowCount - topHiddenRowCount - visibleRowCount);

        let marginTop = topHiddenRowCount * rowHeight;
        let marginBottom = bottomHiddenRowCount * rowHeight;

        if (this._topDataTableMarginHeight !== marginTop) {
            this._topDataTableMarginHeight = marginTop;
            this._topDataTableMarginElement.style.height = marginTop + "px";
        }

        if (this._bottomDataTableMarginElement !== marginBottom) {
            this._bottomDataTableMarginHeight = marginBottom;
            this._bottomDataTableMarginElement.style.height = marginBottom + "px";
        }

        this._dataTableElement.classList.toggle("odd-first-zebra-stripe", !!(topHiddenRowCount % 2));

        this.dataTableBodyElement.removeChildren();

        for (let i = topHiddenRowCount; i < topHiddenRowCount + visibleRowCount; ++i) {
            let rowDataGridNode = revealedRows[i];
            if (!rowDataGridNode)
                continue;
            this.dataTableBodyElement.appendChild(rowDataGridNode.element);
        }

        this.dataTableBodyElement.appendChild(this._fillerRowElement);
    }

    addPlaceholderNode()
    {
        if (this.placeholderNode)
            this.placeholderNode.makeNormal();

        var emptyData = {};
        for (var identifier of this.columns.keys())
            emptyData[identifier] = "";
        this.placeholderNode = new WebInspector.PlaceholderDataGridNode(emptyData);
        this.appendChild(this.placeholderNode);
    }

    appendChild(child)
    {
        this.insertChild(child, this.children.length);
    }

    insertChild(child, index)
    {
        console.assert(child);
        if (!child)
            return;

        console.assert(child.parent !== this);
        if (child.parent === this)
            return;

        if (child.parent)
            child.parent.removeChild(child);

        this.children.splice(index, 0, child);
        this.hasChildren = true;

        child.parent = this;
        child.dataGrid = this.dataGrid;
        child._recalculateSiblings(index);

        delete child._depth;
        delete child._revealed;
        delete child._attached;
        delete child._leftPadding;
        child._shouldRefreshChildren = true;

        var current = child.children[0];
        while (current) {
            current.dataGrid = this.dataGrid;
            delete current._depth;
            delete current._revealed;
            delete current._attached;
            delete current._leftPadding;
            current._shouldRefreshChildren = true;
            current = current.traverseNextNode(false, child, true);
        }

        if (this.expanded)
            child._attach();

        if (!this.dataGrid.hasFilters())
            return;

        this.dataGrid._applyFiltersToNodeAndDispatchEvent(child);
    }

    removeChild(child)
    {
        console.assert(child);
        if (!child)
            return;

        console.assert(child.parent === this);
        if (child.parent !== this)
            return;

        child.deselect();
        child._detach();

        this.children.remove(child, true);

        if (child.previousSibling)
            child.previousSibling.nextSibling = child.nextSibling;
        if (child.nextSibling)
            child.nextSibling.previousSibling = child.previousSibling;

        child.dataGrid = null;
        child.parent = null;
        child.nextSibling = null;
        child.previousSibling = null;

        if (this.children.length <= 0)
            this.hasChildren = false;

        console.assert(!child.isPlaceholderNode, "Shouldn't delete the placeholder node.");
    }

    removeChildren()
    {
        for (var i = 0; i < this.children.length; ++i) {
            var child = this.children[i];
            child.deselect();
            child._detach();

            child.dataGrid = null;
            child.parent = null;
            child.nextSibling = null;
            child.previousSibling = null;
        }

        this.children = [];
        this.hasChildren = false;
    }

    removeChildrenRecursive()
    {
        var childrenToRemove = this.children;

        var child = this.children[0];
        while (child) {
            if (child.children.length)
                childrenToRemove = childrenToRemove.concat(child.children);
            child = child.traverseNextNode(false, this, true);
        }

        for (var i = 0; i < childrenToRemove.length; ++i) {
            child = childrenToRemove[i];
            child.deselect();
            child._detach();

            child.children = [];
            child.dataGrid = null;
            child.parent = null;
            child.nextSibling = null;
            child.previousSibling = null;
        }

        this.children = [];
    }

    findNode(comparator, skipHidden, stayWithin, dontPopulate)
    {
        console.assert(typeof comparator === "function");

        let currentNode = this._rows[0];
        while (currentNode && !currentNode.root) {
            if (!currentNode.isPlaceholderNode && !(skipHidden && currentNode.hidden)) {
                if (comparator(currentNode))
                    return currentNode;
            }

            currentNode = currentNode.traverseNextNode(skipHidden, stayWithin, dontPopulate);
        }

        return null;
    }

    sortNodes(comparator)
    {
        if (this._sortNodesRequestId)
            return;

        this._sortNodesRequestId = window.requestAnimationFrame(this._sortNodesCallback.bind(this, comparator));
    }

    sortNodesImmediately(comparator)
    {
        this._sortNodesCallback(comparator);
    }

    _sortNodesCallback(comparator)
    {
        function comparatorWrapper(aNode, bNode)
        {
            console.assert(!aNode.hasChildren, "This sort method can't be used with parent nodes, children will be displayed out of order.");
            console.assert(!bNode.hasChildren, "This sort method can't be used with parent nodes, children will be displayed out of order.");

            if (aNode.isPlaceholderNode)
                return 1;
            if (bNode.isPlaceholderNode)
                return -1;

            var reverseFactor = this.sortOrder !== WebInspector.DataGrid.SortOrder.Ascending ? -1 : 1;
            return reverseFactor * comparator(aNode, bNode);
        }

        this._sortNodesRequestId = undefined;

        if (this._editing) {
            this._sortAfterEditingCallback = this.sortNodes.bind(this, comparator);
            return;
        }

        this._rows.sort(comparatorWrapper.bind(this));
        this._noteRowsChanged();

        let previousSiblingNode = null;
        for (let node of this._rows) {
            node.previousSibling = previousSiblingNode;
            if (previousSiblingNode)
                previousSiblingNode.nextSibling = node;
            previousSiblingNode = node;
        }

        if (previousSiblingNode)
            previousSiblingNode.nextSibling = null;

        // A sortable data grid might not be added to a view, so it needs its layout updated here.
        if (!this.parentView)
            this.updateLayoutIfNeeded();
    }

    _toggledSortOrder()
    {
        return this._sortOrder !== WebInspector.DataGrid.SortOrder.Descending ? WebInspector.DataGrid.SortOrder.Descending : WebInspector.DataGrid.SortOrder.Ascending;
    }

    _selectSortColumnAndSetOrder(columnIdentifier, sortOrder)
    {
        this.sortColumnIdentifier = columnIdentifier;
        this.sortOrder = sortOrder;
    }

    _keyDown(event)
    {
        if (!this.selectedNode || event.shiftKey || event.metaKey || event.ctrlKey || this._editing)
            return;

        var handled = false;
        var nextSelectedNode;
        if (event.keyIdentifier === "Up" && !event.altKey) {
            nextSelectedNode = this.selectedNode.traversePreviousNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable)
                nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
            handled = nextSelectedNode ? true : false;
        } else if (event.keyIdentifier === "Down" && !event.altKey) {
            nextSelectedNode = this.selectedNode.traverseNextNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable)
                nextSelectedNode = nextSelectedNode.traverseNextNode(true);
            handled = nextSelectedNode ? true : false;
        } else if (event.keyIdentifier === "Left") {
            if (this.selectedNode.expanded) {
                if (event.altKey)
                    this.selectedNode.collapseRecursively();
                else
                    this.selectedNode.collapse();
                handled = true;
            } else if (this.selectedNode.parent && !this.selectedNode.parent.root) {
                handled = true;
                if (this.selectedNode.parent.selectable) {
                    nextSelectedNode = this.selectedNode.parent;
                    handled = nextSelectedNode ? true : false;
                } else if (this.selectedNode.parent)
                    this.selectedNode.parent.collapse();
            }
        } else if (event.keyIdentifier === "Right") {
            if (!this.selectedNode.revealed) {
                this.selectedNode.reveal();
                handled = true;
            } else if (this.selectedNode.hasChildren) {
                handled = true;
                if (this.selectedNode.expanded) {
                    nextSelectedNode = this.selectedNode.children[0];
                    handled = nextSelectedNode ? true : false;
                } else {
                    if (event.altKey)
                        this.selectedNode.expandRecursively();
                    else
                        this.selectedNode.expand();
                }
            }
        } else if (event.keyCode === 8 || event.keyCode === 46) {
            if (this._deleteCallback) {
                handled = true;
                this._deleteCallback(this.selectedNode);
            }
        } else if (isEnterKey(event)) {
            if (this._editCallback) {
                handled = true;
                this._startEditing(this.selectedNode._element.children[0]);
            }
        }

        if (nextSelectedNode) {
            nextSelectedNode.reveal();
            nextSelectedNode.select();
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    closed()
    {
        // Implemented by subclasses.
    }

    expand()
    {
        // This is the root, do nothing.
    }

    collapse()
    {
        // This is the root, do nothing.
    }

    reveal()
    {
        // This is the root, do nothing.
    }

    revealAndSelect()
    {
        // This is the root, do nothing.
    }

    dataGridNodeFromNode(target)
    {
        var rowElement = target.enclosingNodeOrSelfWithNodeName("tr");
        return rowElement && rowElement._dataGridNode;
    }

    dataGridNodeFromPoint(x, y)
    {
        var node = this._dataTableElement.ownerDocument.elementFromPoint(x, y);
        var rowElement = node.enclosingNodeOrSelfWithNodeName("tr");
        return rowElement && rowElement._dataGridNode;
    }

    _headerCellClicked(event)
    {
        let cell = event.target.enclosingNodeOrSelfWithNodeName("th");
        if (!cell || !cell.columnIdentifier || !cell.classList.contains(WebInspector.DataGrid.SortableColumnStyleClassName))
            return;

        let sortOrder = this._sortColumnIdentifier === cell.columnIdentifier ? this._toggledSortOrder() : this.sortOrder;
        this._selectSortColumnAndSetOrder(cell.columnIdentifier, sortOrder);
    }

    _mouseoverColumnCollapser(event)
    {
        var cell = event.target.enclosingNodeOrSelfWithNodeName("th");
        if (!cell || !cell.collapsesGroup)
            return;

        cell.classList.add("mouse-over-collapser");
    }

    _mouseoutColumnCollapser(event)
    {
        var cell = event.target.enclosingNodeOrSelfWithNodeName("th");
        if (!cell || !cell.collapsesGroup)
            return;

        cell.classList.remove("mouse-over-collapser");
    }

    _clickInColumnCollapser(event)
    {
        var cell = event.target.enclosingNodeOrSelfWithNodeName("th");
        if (!cell || !cell.collapsesGroup)
            return;

        this._collapseColumnGroupWithCell(cell);

        event.stopPropagation();
        event.preventDefault();
    }

    collapseColumnGroup(columnGroup)
    {
        var collapserColumnIdentifier = null;
        for (var [identifier, column] of this.columns) {
            if (column["collapsesGroup"] === columnGroup) {
                collapserColumnIdentifier = identifier;
                break;
            }
        }

        console.assert(collapserColumnIdentifier);
        if (!collapserColumnIdentifier)
            return;

        var cell = this._headerTableCellElements.get(collapserColumnIdentifier);
        this._collapseColumnGroupWithCell(cell);
    }

    _collapseColumnGroupWithCell(cell)
    {
        var columnsWillCollapse = cell.classList.toggle("collapsed");

        this.willToggleColumnGroup(cell.collapsesGroup, columnsWillCollapse);

        for (var [identifier, column] of this.columns) {
            if (column["group"] === cell.collapsesGroup)
                this.setColumnVisible(identifier, !columnsWillCollapse);
        }

        var collapserButton = cell.querySelector(".collapser-button");
        if (collapserButton)
            collapserButton.title = columnsWillCollapse ? this._collapserButtonExpandColumnsToolTip() : this._collapserButtonCollapseColumnsToolTip();

        this.didToggleColumnGroup(cell.collapsesGroup, columnsWillCollapse);
    }

    _collapserButtonCollapseColumnsToolTip()
    {
        return WebInspector.UIString("Collapse columns");
    }

    _collapserButtonExpandColumnsToolTip()
    {
        return WebInspector.UIString("Expand columns");
    }

    willToggleColumnGroup(columnGroup, willCollapse)
    {
        // Implemented by subclasses if needed.
    }

    didToggleColumnGroup(columnGroup, didCollapse)
    {
        // Implemented by subclasses if needed.
    }

    headerTableHeader(columnIdentifier)
    {
        return this._headerTableCellElements.get(columnIdentifier);
    }

    _mouseDownInDataTable(event)
    {
        var gridNode = this.dataGridNodeFromNode(event.target);
        if (!gridNode || !gridNode.selectable)
            return;

        if (gridNode.isEventWithinDisclosureTriangle(event))
            return;

        if (event.metaKey) {
            if (gridNode.selected)
                gridNode.deselect();
            else
                gridNode.select();
        } else
            gridNode.select();
    }

    _contextMenuInHeader(event)
    {
        let contextMenu = WebInspector.ContextMenu.createFromEvent(event);

        if (this._hasCopyableData())
            contextMenu.appendItem(WebInspector.UIString("Copy Table"), this._copyTable.bind(this));

        let headerCellElement = event.target.enclosingNodeOrSelfWithNodeName("th");
        if (!headerCellElement)
            return;

        let columnIdentifier = headerCellElement.columnIdentifier;
        let column = this.columns.get(columnIdentifier);
        console.assert(column, "Missing column info for identifier: " + columnIdentifier);
        if (!column)
            return;

        if (column.sortable) {
            contextMenu.appendSeparator();

            if (this.sortColumnIdentifier !== columnIdentifier || this.sortOrder !== WebInspector.DataGrid.SortOrder.Ascending) {
                contextMenu.appendItem(WebInspector.UIString("Sort Ascending"), () => {
                    this._selectSortColumnAndSetOrder(columnIdentifier, WebInspector.DataGrid.SortOrder.Ascending);
                });
            }

            if (this.sortColumnIdentifier !== columnIdentifier || this.sortOrder !== WebInspector.DataGrid.SortOrder.Descending) {
                contextMenu.appendItem(WebInspector.UIString("Sort Descending"), () => {
                    this._selectSortColumnAndSetOrder(columnIdentifier, WebInspector.DataGrid.SortOrder.Descending);
                });
            }
        }

        if (this._columnChooserEnabled) {
            let didAddSeparator = false;

            for (let [identifier, columnInfo] of this.columns) {
                if (columnInfo.locked)
                    continue;

                if (!didAddSeparator) {
                    contextMenu.appendSeparator();
                    didAddSeparator = true;
                }

                contextMenu.appendCheckboxItem(columnInfo.title, () => { this.setColumnVisible(identifier, columnInfo.hidden); }, !columnInfo.hidden);
            }
        }
    }

    _contextMenuInDataTable(event)
    {
        let contextMenu = WebInspector.ContextMenu.createFromEvent(event);

        let gridNode = this.dataGridNodeFromNode(event.target);

        if (gridNode)
            gridNode.appendContextMenuItems(contextMenu);

        if (this.dataGrid._refreshCallback && (!gridNode || gridNode !== this.placeholderNode))
            contextMenu.appendItem(WebInspector.UIString("Refresh"), this._refreshCallback.bind(this));

        if (gridNode) {
            if (gridNode.selectable && gridNode.copyable && !gridNode.isEventWithinDisclosureTriangle(event)) {
                contextMenu.appendItem(WebInspector.UIString("Copy Row"), this._copyRow.bind(this, event.target));
                contextMenu.appendItem(WebInspector.UIString("Copy Table"), this._copyTable.bind(this));

                if (this.dataGrid._editCallback) {
                    if (gridNode === this.placeholderNode)
                        contextMenu.appendItem(WebInspector.UIString("Add New"), this._startEditing.bind(this, event.target));
                    else {
                        let element = event.target.enclosingNodeOrSelfWithNodeName("td");
                        let columnIdentifier = element.__columnIdentifier;
                        let columnTitle = this.dataGrid.columns.get(columnIdentifier)["title"];
                        contextMenu.appendItem(WebInspector.UIString("Edit “%s”").format(columnTitle), this._startEditing.bind(this, event.target));
                    }
                }

                if (this.dataGrid._deleteCallback && gridNode !== this.placeholderNode)
                    contextMenu.appendItem(WebInspector.UIString("Delete"), this._deleteCallback.bind(this, gridNode));
            }

            if (gridNode.children.some((child) => child.hasChildren) || (gridNode.hasChildren && !gridNode.children.length)) {
                contextMenu.appendSeparator();

                contextMenu.appendItem(WebInspector.UIString("Expand All"), gridNode.expandRecursively.bind(gridNode));
                contextMenu.appendItem(WebInspector.UIString("Collapse All"), gridNode.collapseRecursively.bind(gridNode));
            }
        }
    }

    _clickInDataTable(event)
    {
        var gridNode = this.dataGridNodeFromNode(event.target);
        if (!gridNode || !gridNode.hasChildren)
            return;

        if (!gridNode.isEventWithinDisclosureTriangle(event))
            return;

        if (gridNode.expanded) {
            if (event.altKey)
                gridNode.collapseRecursively();
            else
                gridNode.collapse();
        } else {
            if (event.altKey)
                gridNode.expandRecursively();
            else
                gridNode.expand();
        }
    }

    textForDataGridNodeColumn(node, columnIdentifier)
    {
        var data = node.data[columnIdentifier];
        return (data instanceof Node ? data.textContent : data) || "";
    }

    set copyTextDelimiter(value) { this._copyTextDelimiter = value; }

    _copyTextForDataGridNode(node)
    {
        let fields = node.dataGrid.orderedColumns.map((identifier) => this.textForDataGridNodeColumn(node, identifier));
        return fields.join(this._copyTextDelimiter);
    }

    _copyTextForDataGridHeaders()
    {
        let fields = this.orderedColumns.map((identifier) => this.headerTableHeader(identifier).textContent);
        return fields.join(this._copyTextDelimiter);
    }

    handleBeforeCopyEvent(event)
    {
        if (this.selectedNode && window.getSelection().isCollapsed)
            event.preventDefault();
    }

    handleCopyEvent(event)
    {
        if (!this.selectedNode || !window.getSelection().isCollapsed)
            return;

        var copyText = this._copyTextForDataGridNode(this.selectedNode);
        event.clipboardData.setData("text/plain", copyText);
        event.stopPropagation();
        event.preventDefault();
    }

    _copyRow(target)
    {
        var gridNode = this.dataGridNodeFromNode(target);
        if (!gridNode)
            return;

        var copyText = this._copyTextForDataGridNode(gridNode);
        InspectorFrontendHost.copyText(copyText);
    }

    _copyTable()
    {
        let copyData = [];
        copyData.push(this._copyTextForDataGridHeaders());
        for (let gridNode of this.children) {
            if (!gridNode.copyable)
                continue;
            copyData.push(this._copyTextForDataGridNode(gridNode));
        }

        InspectorFrontendHost.copyText(copyData.join("\n"));
    }

    _hasCopyableData()
    {
        let gridNode = this.children[0];
        return gridNode && gridNode.selectable && gridNode.copyable;
    }

    get resizeMethod()
    {
        if (!this._resizeMethod)
            return WebInspector.DataGrid.ResizeMethod.Nearest;
        return this._resizeMethod;
    }

    set resizeMethod(method)
    {
        this._resizeMethod = method;
    }

    resizerDragStarted(resizer)
    {
        if (!resizer[WebInspector.DataGrid.NextColumnOrdinalSymbol])
            return true; // Abort the drag;

        this._currentResizer = resizer;
    }

    resizerDragging(resizer, positionDelta)
    {
        console.assert(resizer === this._currentResizer, resizer, this._currentResizer);
        if (resizer !== this._currentResizer)
            return;

        let isRTL = WebInspector.resolvedLayoutDirection() === WebInspector.LayoutDirection.RTL;
        if (isRTL)
            positionDelta *= -1;

        // Constrain the dragpoint to be within the containing div of the datagrid.
        let dragPoint = 0;
        if (isRTL)
            dragPoint += this.element.totalOffsetRight - resizer.initialPosition - positionDelta;
        else
            dragPoint += resizer.initialPosition - this.element.totalOffsetLeft - positionDelta;

        // Constrain the dragpoint to be within the space made up by the
        // column directly to the left and the column directly to the right.
        var leftColumnIndex = resizer[WebInspector.DataGrid.PreviousColumnOrdinalSymbol];
        var rightColumnIndex = resizer[WebInspector.DataGrid.NextColumnOrdinalSymbol];
        var firstRowCells = this._headerTableBodyElement.rows[0].cells;
        let leadingEdgeOfPreviousColumn = 0;
        for (let i = 0; i < leftColumnIndex; ++i)
            leadingEdgeOfPreviousColumn += firstRowCells[i].offsetWidth;

        // Differences for other resize methods
        if (this.resizeMethod === WebInspector.DataGrid.ResizeMethod.Last) {
            rightColumnIndex = this.resizers.length;
        } else if (this.resizeMethod === WebInspector.DataGrid.ResizeMethod.First) {
            leadingEdgeOfPreviousColumn += firstRowCells[leftColumnIndex].offsetWidth - firstRowCells[0].offsetWidth;
            leftColumnIndex = 0;
        }

        let trailingEdgeOfNextColumn = leadingEdgeOfPreviousColumn + firstRowCells[leftColumnIndex].offsetWidth + firstRowCells[rightColumnIndex].offsetWidth;

        // Give each column some padding so that they don't disappear.
        let leftMinimum = leadingEdgeOfPreviousColumn + this.ColumnResizePadding;
        let rightMaximum = trailingEdgeOfNextColumn - this.ColumnResizePadding;

        dragPoint = Number.constrain(dragPoint, leftMinimum, rightMaximum);

        resizer.element.style.setProperty(isRTL ? "right" : "left", `${dragPoint - this.CenterResizerOverBorderAdjustment}px`);

        let percentLeftColumn = (((dragPoint - leadingEdgeOfPreviousColumn) / this._dataTableElement.offsetWidth) * 100) + "%";
        this._headerTableColumnGroupElement.children[leftColumnIndex].style.width = percentLeftColumn;
        this._dataTableColumnGroupElement.children[leftColumnIndex].style.width = percentLeftColumn;

        let percentRightColumn = (((trailingEdgeOfNextColumn - dragPoint) / this._dataTableElement.offsetWidth) * 100) + "%";
        this._headerTableColumnGroupElement.children[rightColumnIndex].style.width = percentRightColumn;
        this._dataTableColumnGroupElement.children[rightColumnIndex].style.width = percentRightColumn;

        this._positionResizerElements();
        this._positionHeaderViews();

        const skipHidden = true;
        const dontPopulate = true;

        let leftColumnIdentifier = this.orderedColumns[leftColumnIndex];
        let rightColumnIdentifier = this.orderedColumns[rightColumnIndex];
        let child = this.children[0];

        while (child) {
            child.didResizeColumn(leftColumnIdentifier);
            child.didResizeColumn(rightColumnIdentifier);
            child = child.traverseNextNode(skipHidden, this, dontPopulate);
        }

        event.preventDefault();
    }

    resizerDragEnded(resizer)
    {
        console.assert(resizer === this._currentResizer, resizer, this._currentResizer);
        if (resizer !== this._currentResizer)
            return;

        this._currentResizer = null;
    }

    _updateFilter()
    {
        if (this._scheduledFilterUpdateIdentifier) {
            cancelAnimationFrame(this._scheduledFilterUpdateIdentifier);
            this._scheduledFilterUpdateIdentifier = undefined;
        }

        if (!this._rows.length)
            return;

        this._textFilterRegex = simpleGlobStringToRegExp(this._filterText, "i");

        if (this._applyFilterToNodesTask && this._applyFilterToNodesTask.processing)
            this._applyFilterToNodesTask.cancel();

        function *createIteratorForNodesToBeFiltered()
        {
            // Don't populate if we don't have any active filters.
            // We only need to populate when a filter needs to reveal.
            let dontPopulate = !this.hasFilters();

            let currentNode = this._rows[0];
            while (currentNode && !currentNode.root) {
                yield currentNode;
                currentNode = currentNode.traverseNextNode(false, null, dontPopulate);
            }
        }

        let items = createIteratorForNodesToBeFiltered.call(this);
        this._applyFilterToNodesTask = new WebInspector.YieldableTask(this, items, {workInterval: 100});

        this._filterDidModifyNodeWhileProcessingItems = false;

        this._applyFilterToNodesTask.start();
    }

    // YieldableTask delegate

    yieldableTaskWillProcessItem(task, node)
    {
        let nodeWasModified = this._applyFiltersToNodeAndDispatchEvent(node);
        if (nodeWasModified)
            this._filterDidModifyNodeWhileProcessingItems = true;
    }

    yieldableTaskDidYield(task, processedItems, elapsedTime)
    {
        if (!this._filterDidModifyNodeWhileProcessingItems)
            return;

        this._filterDidModifyNodeWhileProcessingItems = false;

        this.dispatchEventToListeners(WebInspector.DataGrid.Event.FilterDidChange);
    }

    yieldableTaskDidFinish(task)
    {
        this._applyFilterToNodesTask = null;
    }
};

WebInspector.DataGrid.Event = {
    SortChanged: "datagrid-sort-changed",
    SelectedNodeChanged: "datagrid-selected-node-changed",
    ExpandedNode: "datagrid-expanded-node",
    CollapsedNode: "datagrid-collapsed-node",
    FilterDidChange: "datagrid-filter-did-change",
    NodeWasFiltered: "datagrid-node-was-filtered"
};

WebInspector.DataGrid.ResizeMethod = {
    Nearest: "nearest",
    First: "first",
    Last: "last"
};

WebInspector.DataGrid.SortOrder = {
    Indeterminate: "data-grid-sort-order-indeterminate",
    Ascending: "data-grid-sort-order-ascending",
    Descending: "data-grid-sort-order-descending"
};

WebInspector.DataGrid.PreviousColumnOrdinalSymbol = Symbol("previous-column-ordinal");
WebInspector.DataGrid.NextColumnOrdinalSymbol = Symbol("next-column-ordinal");
WebInspector.DataGrid.WasExpandedDuringFilteringSymbol = Symbol("was-expanded-during-filtering");

WebInspector.DataGrid.ColumnResizePadding = 10;
WebInspector.DataGrid.CenterResizerOverBorderAdjustment = 3;

WebInspector.DataGrid.SortColumnAscendingStyleClassName = "sort-ascending";
WebInspector.DataGrid.SortColumnDescendingStyleClassName = "sort-descending";
WebInspector.DataGrid.SortableColumnStyleClassName = "sortable";
