// Copyright 2017-2018 Dgraph Labs, Inc. and Contributors
//
// Licensed under the Dgraph Community License (the "License"); you
// may not use this file except in compliance with the License. You
// may obtain a copy of the License at
//
//     https://github.com/dgraph-io/ratel/blob/master/LICENSE

import _ from "lodash";
import uuid from "uuid";

import GraphLabeler from "./GraphLabeler";

export const FIRST_RENDER_LIMIT = 400;

class NodesDataset extends Array {
    add = x => this.push(x);
    get = uid => this.find(x => x.uid === uid);
}

function findAndMerge(nodes, n) {
    let properties = n.properties,
        uid = properties.attrs.uid,
        node = nodes.get(uid);

    if (!node) {
        console.warn("Expected to find node with uid: ", uid);
        return;
    }

    node.properties = Object.assign({}, properties, node.properties);
    node.color = node.color || n.color;
    node.label = node.label || n.label || "";
    node.name = node.name || n.name || "";
}

function aggregationPrefix(properties) {
    let aggTerms = ["count(", "max(", "min(", "sum("];
    for (const k in Object.keys(properties)) {
        if (k === "count") {
            return ["count", "count"];
        }
        for (const term of aggTerms) {
            if (k.startsWith(term)) {
                return [term.substr(0, term.length - 1), k];
            }
        }
    }
    return ["", ""];
}

export function shortenName(label) {
    label = String(label);
    let words = label.split(" "),
        firstWord = words[0];
    if (firstWord.length > 20) {
        label = [firstWord.substr(0, 9), firstWord.substr(9, 7) + "..."].join(
            "-\n",
        );
    } else if (firstWord.length > 10) {
        label = [firstWord.substr(0, 9), firstWord.substr(9)].join("-\n");
    } else {
        // First word is less than 10 chars so we can display it in full.
        if (words.length > 1) {
            if (words[1].length > 10) {
                label = [firstWord, words[1].substr(0, 7) + "..."].join("\n");
            } else {
                label = [firstWord, words[1]].join("\n");
            }
        } else {
            label = firstWord;
        }
    }

    return label;
}

export function getNodeLabel(properties, regex) {
    let label = "";
    let keys = Object.keys(properties);
    if (keys.length === 1) {
        label = aggregationPrefix(properties)[0];
        if (label !== "") {
            return label;
        }
    }

    let nameKey = getNameKey(properties, regex);
    let val = properties[nameKey];
    if (Array.isArray(val) && val.length > 0) {
        return val[0];
    }
    return val || "";
}

function getNameKey(properties, regex) {
    return Object.keys(properties).find(p => regex.test(p)) || "";
}

export class GraphParser {
    queue = [];

    // Map of whether a Node with an Uid has already been created. This helps
    // us avoid creating duplicating nodes while parsing the JSON structure
    // which is a tree.
    uidMap = {};
    edgeMap = {};
    labeler = new GraphLabeler();
    nodesDataset = new NodesDataset();
    edgesDataset = new NodesDataset();

    addResponseToQueue = response => {
        response = _.cloneDeep(response);

        for (let k in response) {
            let block = response[k];

            for (let i = 0; i < block.length; i++) {
                this.queue.push({
                    node: block[i],
                    src: {
                        id: "",
                        pred: k,
                    },
                });
            }
        }
    };

    processQueue = (treeView, regexStr = null, maxAdd = FIRST_RENDER_LIMIT) => {
        let processedNodeCount = 0;
        const facetDelimeter = "|";

        while (this.queue.length > 0) {
            if (processedNodeCount >= maxAdd) {
                // Break now, with more nodes still in queue.
                return;
            }
            processedNodeCount++;

            const obj = this.queue.shift();

            const properties = {
                    attrs: {},
                    facets: {},
                },
                edgeAttributes = {
                    facets: {},
                };

            // Some nodes like results of aggregation queries, max , min, count etc don't have a
            // uid, so we need to assign thme one.
            const uid = obj.node.uid || uuid();

            for (let prop of Object.keys(obj.node).sort()) {
                // We can have a key-val pair, another array or an object here (in case of facets).
                const val = obj.node[prop];

                const delimIdx = prop.indexOf(facetDelimeter);
                if (delimIdx >= 0) {
                    const facetPred = prop.substr(0, delimIdx);
                    const facetKey = prop.substr(delimIdx + 1);
                    if (facetPred === obj.src.pred) {
                        edgeAttributes.facets[facetKey] = val;
                    } else {
                        properties.facets[`${facetPred}[${facetKey}]`] = val;
                    }
                } else if (
                    Array.isArray(val) &&
                    val.length > 0 &&
                    typeof val[0] === "object"
                ) {
                    // These are child nodes, lets add them to the queue.
                    val.map(x =>
                        this.queue.push({
                            node: x,
                            src: {
                                pred: prop,
                                id: uid,
                            },
                        }),
                    );
                } else {
                    properties.attrs[prop] = val;
                }
            }

            function nameNode(nodeAttrs, regexStr) {
                // aggrTerm can be count, min or max. aggrPred is the actual predicate returned.
                const [aggrTerm, aggrPred] = aggregationPrefix(nodeAttrs);

                if (aggrTerm !== "") {
                    return {
                        displayLabel: nodeAttrs[aggrPred],
                        fullName: "",
                    };
                } else {
                    const fullName = regexStr
                        ? getNodeLabel(nodeAttrs, new RegExp(regexStr, "i"))
                        : "";
                    return {
                        displayLabel: shortenName(fullName),
                        fullName,
                    };
                }
            }

            const { displayLabel, fullName } = nameNode(
                properties.attrs,
                regexStr,
            );
            const groupProperties = this.labeler.getGroupProperties(
                obj.src.pred,
            );

            let n = {
                id: uid,
                uid: obj.node.uid,
                // For aggregation nodes, label is the actual value, for other nodes its
                // the value of name.
                label: displayLabel,
                properties: properties,
                color: groupProperties.color,
                group: obj.src.pred,
                name: fullName,
            };

            if (!this.uidMap[uid]) {
                this.uidMap[uid] = true;
                this.nodesDataset.add(n);
            } else {
                // We have already put this node. So we need to find the node in nodes,
                // merge new properties and put it back.
                findAndMerge(this.nodesDataset, n);
            }

            // Root nodes don't have a source node, so we don't want to create any edge for them.
            if (obj.src.id === "") {
                continue;
            }

            let fromTo = [obj.src.id, uid].filter(val => val).join("-");

            if (this.edgeMap[fromTo]) {
                const oldEdge = this.edgesDataset.get(fromTo);
                if (!oldEdge) {
                    continue;
                }

                // This is helpful in case of shortest path results so that we can get
                // the edge weights.
                _.merge(edgeAttributes, oldEdge.properties);
                oldEdge.properties = edgeAttributes;
            } else {
                this.edgeMap[fromTo] = true;

                this.edgesDataset.add({
                    source: obj.src.id,
                    target: uid,
                    properties: edgeAttributes,
                    label: groupProperties.label,
                    predicate: groupProperties.pred,
                    color: groupProperties.color,
                });
            }
        }
    };

    getCurrentGraph = () => {
        stringifyTitles(this.nodesDataset);
        stringifyTitles(this.edgesDataset);

        return {
            nodes: this.nodesDataset,
            edges: this.edgesDataset,
            remainingNodes: this.queue.length,
            labels: this.labeler.getAxisPlot(),
        };
    };
}

// processGraph returns graph properties from response.
export function processGraph(response, treeView, regexStr) {
    const parser = new GraphParser();
    parser.addResponseToQueue(response);
    parser.processQueue(treeView, regexStr);
    return parser.getCurrentGraph();
}

function stringifyTitles(nodes) {
    nodes.forEach(n => (n.title = JSON.stringify(n.properties)));
}
