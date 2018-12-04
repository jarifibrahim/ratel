import React from "react";

import VerticalPanelLayout from "../PanelLayout/VerticalPanelLayout";
import EditorPanel from "../EditorPanel";
import FrameList from "../FrameList";
import FrameItem from "../FrameItem";

import "./QueryView.scss";

export default function QueryView({
    handleClearQuery,
    handleDiscardFrame,
    handleRunQuery,
    onSelectQuery,
    handleUpdateAction,
    handleUpdateConnectedState,
    handleUpdateQuery,
    activeFrameId,
    frames,
    framesTab,
    saveCodeMirrorInstance,
    url,
    patchFrame,
    updateFrame,
}) {
    const canDiscardAll = frames.length > 0;

    return (
        <div className="query-view">
            <h2>Console</h2>
            <VerticalPanelLayout
                first={
                    <div className="query-view-left-scrollable">
                        <EditorPanel
                            canDiscardAll={canDiscardAll}
                            onClearQuery={handleClearQuery}
                            onRunQuery={handleRunQuery}
                            onUpdateQuery={handleUpdateQuery}
                            onUpdateAction={handleUpdateAction}
                            saveCodeMirrorInstance={saveCodeMirrorInstance}
                        />

                        <span className="badge badge-secondary history-label">
                            <i
                                className="fas fa-chevron-down"
                                style={{ fontSize: "0.75em" }}
                            />{" "}
                            History{" "}
                            <i
                                className="fas fa-chevron-down"
                                style={{ fontSize: "0.75em" }}
                            />
                        </span>
                        <FrameList
                            activeFrameId={activeFrameId}
                            frames={frames}
                            framesTab={framesTab}
                            onDiscardFrame={handleDiscardFrame}
                            onSelectQuery={onSelectQuery}
                            onUpdateConnectedState={handleUpdateConnectedState}
                            patchFrame={patchFrame}
                            updateFrame={updateFrame}
                            url={url}
                        />
                    </div>
                }
                second={
                    frames.length ? (
                        <FrameItem
                            activeFrameId={activeFrameId}
                            key={activeFrameId}
                            frame={
                                frames.find(f => f.id === activeFrameId) ||
                                frames[0]
                            }
                            framesTab={framesTab}
                            collapsed={false}
                            onDiscardFrame={handleDiscardFrame}
                            onSelectQuery={onSelectQuery}
                            onUpdateConnectedState={handleUpdateConnectedState}
                            patchFrame={patchFrame}
                            updateFrame={updateFrame}
                            url={url}
                        />
                    ) : (
                        <div className="alert alert-secondary" role="alert">
                            Please run a query or a mutation
                        </div>
                    )
                }
            />
        </div>
    );
}
