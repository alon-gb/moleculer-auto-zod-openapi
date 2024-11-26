const UNRESOLVED_ACTION_NAME = "unknown-action";
const zodToOpenAPI = require("./zod-to-openapi");
const NODE_TYPES = {
	boolean: "boolean",
	number: "number",
	date: "date",
	uuid: "uuid",
	email: "email",
	url: "url",
	string: "string",
	enum: "enum",
  }
  
module.exports = {
	fetchServicesWithActions() {
		return this.broker.call("$node.services", {
			withActions: true,
			onlyLocal: this.settings.onlyLocal,
		});
	},
	fetchAliasesForService(service) {
		return this.broker.call(`${service}.listAliases`);
	},
	async generateSchema() {
		const doc = JSON.parse(JSON.stringify(this.settings.openapi));

		const nodes = await this.fetchServicesWithActions();

		const routes = await this.collectRoutes(nodes);

		this.attachParamsAndOpenapiFromEveryActionToRoutes(routes, nodes);

		this.attachRoutesToDoc(routes, doc);

		return doc;
	},
	attachParamsAndOpenapiFromEveryActionToRoutes(routes, nodes) {
		for (const routeAction in routes) {
			for (const node of nodes) {
				for (const nodeAction in node.actions) {
					if (routeAction === nodeAction) {
						const actionProps = node.actions[nodeAction];
						routes[routeAction].params = actionProps.params || {};
						if (!routes[routeAction].openapi) {
							routes[routeAction].openapi = actionProps.openapi || (
								this.isZod(actionProps.params) ? 
								zodToOpenAPI(actionProps.params) : 
								{}
							);
						}
						break;
					}
				}
			}
		}
	},
	async collectRoutes(nodes) {
		const routes = {};

		for (const node of nodes) {
			// find routes in web-api service
			if (node?.settings?.routes) {
				if (
					this.settings.collectOnlyFromWebServices &&
					this.settings.collectOnlyFromWebServices.length > 0 &&
					!this.settings.collectOnlyFromWebServices.includes(node.name)
				) {
					continue;
				}

				// iterate each route
				for (const route of node.settings.routes) {
					// map standart aliases
					this.buildActionRouteStructFromAliases(route, routes);
				}

				let service = node.name;
				// resolve paths with auto aliases
				const hasAutoAliases = node.settings.routes.some(
					(route) => route.autoAliases,
				);
				if (hasAutoAliases) {
					// suport services that has version, like v1.api
					if (
						Object.prototype.hasOwnProperty.call(node, "version") &&
						node.version !== undefined
					) {
						service = `v${node.version}.${service}`;
					}
					const autoAliases = await this.fetchAliasesForService(service);
					const convertedRoute = this.convertAutoAliasesToRoute(autoAliases);
					this.buildActionRouteStructFromAliases(convertedRoute, routes);
				}
			}
		}

		return routes;
	},
	/**
	 * @link https://github.com/moleculerjs/moleculer-web/blob/155ccf1d3cb755dafd434e84eb95e35ee324a26d/src/index.js#L229
	 * @param autoAliases<Array{Object}>
	 * @returns {{path: string, aliases: {}}}
	 */
	convertAutoAliasesToRoute(autoAliases) {
		const route = {
			path: "",
			autoAliases: true,
			aliases: {},
		};

		for (const obj of autoAliases) {
			const alias = `${obj.methods} ${obj.fullPath}`;
			route.aliases[alias] = obj.actionName || UNRESOLVED_ACTION_NAME;
		}

		return route;
	},
	/**
	 * convert `GET /table`: `table.get`
	 * to {action: {
	 *   actionType:'multipart|null',
	 *   params: {},
	 *   autoAliases: true|undefined
	 *   paths: [
	 *    {base: 'api/uploads', alias: 'GET /table'}
	 *   ]
	 *   openapi: null
	 * }}
	 * @param route
	 * @param routes
	 * @returns {{}}
	 */
	buildActionRouteStructFromAliases(route, routes) {
		for (const alias in route.aliases) {
			const aliasInfo = route.aliases[alias];
			let actionType = aliasInfo.type;

			let action = "";
			if (aliasInfo.action) {
				action = aliasInfo.action;
			} else if (Array.isArray(aliasInfo)) {
				action = aliasInfo[aliasInfo.length - 1];
			} else if (typeof aliasInfo !== "string") {
				action = UNRESOLVED_ACTION_NAME;
			} else {
				action = aliasInfo;
			}
			// support actions like multipart:import.proceedFile
			if (action.includes(":")) {
				[actionType, action] = action.split(":");
			}

			if (!routes[action]) {
				routes[action] = {
					actionType,
					params: {},
					paths: [],
					openapi: null,
				};
			}

			routes[action].paths.push({
				base: route.path || "",
				alias,
				autoAliases: route.autoAliases,
				openapi: aliasInfo.openapi || null,
			});
		}

		return routes;
	},
	attachRoutesToDoc(routes, doc) {
		// route to openapi paths
		for (const action in routes) {
			const { paths, params, actionType, openapi = {} } = routes[action];
			const service = action.split(".").slice(0, -1).join(".");

			this.addTagToDoc(doc, service);

			for (const path of paths) {
				const openApiCopy = JSON.parse(JSON.stringify(openapi));

				// parse method and path from: POST /api/table
				const [tmpMethod, subPath] = path.alias.split(" ");
				const method = tmpMethod.toLowerCase();

				// convert /:table to /{table}
				const openapiPath = this.formatParamUrl(
					this.normalizePath(`${path.base}/${subPath}`),
				);

				const [queryParams, addedQueryParams] =
					this.extractParamsFromUrl(openapiPath);
				for (const qp of queryParams) {
					if (openApiCopy?.properties?.[qp.name]) {
						const openApiProp = openApiCopy.properties[qp.name];
						qp.schema = openApiProp;
						if (openApiProp.description) {
							qp.description = openApiProp.description;
							delete openApiProp.description;
						}
						delete openApiCopy.properties[qp.name];
						if (openApiCopy.required) {
							openApiCopy.required = openApiCopy.required.filter(
								(rp) => rp !== qp.name,
							);
						}
					}
				};
				if (!doc.paths[openapiPath]) {
					doc.paths[openapiPath] = {};
				}

				if (doc.paths[openapiPath][method]) {
					continue;
				}

				// Path Item Object
				// https://github.com/OAI/OpenAPI-Specification/blob/b748a884fa4571ffb6dd6ed9a4d20e38e41a878c/versions/3.0.3.md#path-item-object-example
				doc.paths[openapiPath][method] = {
					summary: "",
					tags: [service],
					// rawParams: params,
					parameters: [...queryParams],
					responses: {
						// attach common responses
						...this.settings.commonPathItemObjectResponses,
					},
				};

				if (method === "get" || method === "delete") {
					doc.paths[openapiPath][method].parameters.push(
						...this.moleculerParamsToQuery(
							params,
							addedQueryParams,
							openApiCopy,
						),
					);
				} else {
					const schemaName = action;
					this.createSchemaFromParams(
						doc,
						schemaName,
						params,
						addedQueryParams,
						{},
						openApiCopy,
					);
					doc.paths[openapiPath][method].requestBody = {
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${schemaName}`,
								},
							},
						},
					};
				}

				if (
					this.settings.requestBodyAndResponseBodyAreSameOnMethods.includes(
						method,
					)
				) {
					doc.paths[openapiPath][method].responses[200] = {
						description:
							this.settings.requestBodyAndResponseBodyAreSameDescription,
						...doc.paths[openapiPath][method].requestBody,
					};
				}

				// if multipart/stream convert fo formData/binary
				if (actionType === "multipart" || actionType === "stream") {
					doc.paths[openapiPath][method] = {
						...doc.paths[openapiPath][method],
						parameters: [...queryParams],
						requestBody: this.getFileContentRequestBodyScheme(
							openapiPath,
							method,
							actionType,
						),
					};
				}

				// merge values from action
				doc.paths[openapiPath][method] = this.mergePathItemObjects(
					doc.paths[openapiPath][method],
					openapi,
				);

				// merge values which exist in web-api service
				// in routes or custom function
				doc.paths[openapiPath][method] = this.mergePathItemObjects(
					doc.paths[openapiPath][method],
					path.openapi,
				);

				// add tags to root of scheme
				if (doc.paths[openapiPath][method].tags) {
					for (const name of doc.paths[openapiPath][method].tags) {
						this.addTagToDoc(doc, name);
					}
				}

				// add components to root of scheme
				if (doc.paths[openapiPath][method].components) {
					doc.components = this.mergeObjects(
						doc.components,
						doc.paths[openapiPath][method].components,
					);
					delete doc.paths[openapiPath][method].components;
				}

				doc.paths[openapiPath][method].summary = `
            ${doc.paths[openapiPath][method].summary}
            (${action})
            ${path.autoAliases ? "[autoAlias]" : ""}
          `.trim();
			}
		}
	},
	addTagToDoc(doc, tagName) {
		const exist = doc.tags.some((v) => v.name === tagName);
		if (!exist && tagName) {
			doc.tags.push({
				name: tagName,
			});
		}
	},
	/**
	 * Convert moleculer params to openapi query params
	 * @param obj
	 * @param exclude{Array<string>}
	 * @returns {[]}
	 */
	moleculerParamsToQuery(obj = {}, exclude = [], openApiCopy = {}) {
		const out = [];

		for (const fieldName in obj) {
			// skip system field in validator scheme
			if (fieldName.startsWith("$$")) {
				continue;
			}
			if (exclude.includes(fieldName)) {
				continue;
			}

			const node = obj[fieldName];

			// array nodes
			if (Array.isArray(node) || (node.type && node.type === "array")) {
				const item = {
					name: `${fieldName}[]`,
					description: node.$$t,
					in: "query",
					schema: {
						type: "array",
						items: this.getTypeAndExample({
							default: node.default ? node.default[0] : undefined,
							enum: node.enum,
							type: node.items,
						}),
						unique: node.unique,
						minItems: node.length || node.min,
						maxItems: node.length || node.max,
					},
				};
				out.push(item);
				continue;
			}
			const openApiProp = openApiCopy?.properties?.[fieldName];
			out.push({
				in: "query",
				name: fieldName,
				description:
					openApiProp
						? openApiProp.description
						: node.$$t,
				schema:
					openApiProp
						? openApiProp
						: this.getTypeAndExample(node),
			});
		}

		return out;
	},
	/**
	 * Convert moleculer params to openapi definitions(components schemas)
	 * @param doc
	 * @param schemeName
	 * @param obj
	 * @param exclude{Array<string>}
	 * @param parentNode
	 */
	createSchemaFromParams(
		doc,
		schemeName,
		obj,
		exclude = [],
		parentNode = {},
		openApiCopy = {},
	) {
		// Schema model
		// https://github.com/OAI/OpenAPI-Specification/blob/b748a884fa4571ffb6dd6ed9a4d20e38e41a878c/versions/3.0.3.md#models-with-polymorphism-support
		const def = {
			type: "object",
			properties: {},
			required: [],
			default: parentNode.default,
		};
		doc.components.schemas[schemeName] = def;

		for (const fieldName in obj) {
			if (obj.description) {
				def.description = obj.description;
			}
			// // arr or object desc
			// if (fieldName === "$$t") {
			// 	def.description = obj[fieldName];
			// }

			let node = obj[fieldName];
			const openApiProp = openApiCopy?.properties?.[fieldName];
			if (openApiProp) {
				node = openApiCopy.properties[fieldName];
				def.properties[fieldName] = node;				
			}
			
			// const nextSchemeName = `${schemeName}.${fieldName}`;
		
			// if (
			// 	// expand $$type: "object|optional"
			// 	node &&
			// 	node.$$type &&
			// 	node.$$type.includes("object")
			// ) {
			// 	node = {
			// 		type: "object",
			// 		optional: node.$$type.includes("optional"),
			// 		$$t: node.$$t || "",
			// 		props: {
			// 			...node,
			// 		},
			// 	};
			// } else if (
			// 	// skip system field in validator scheme
			// 	fieldName.startsWith("$$")
			// ) {
			// 	continue;
			// }

			// if (exclude.includes(fieldName)) {
			// 	continue;
			// }

			// // expand from short rule to full
			// if (!(node && node.type)) {
			// 	node = this.expandShortDefinition(node);
			// }

			// // mark as required
			// if (node.type === "array") {
			// 	if (node.min || node.length || node.max) {
			// 		def.required.push(fieldName);
			// 		def.minItems = node.length || node.min;
			// 		def.maxItems = node.length || node.max;
			// 	}
			// 	def.unique = node.unique;
			// } else if (!node.optional) {
			// 	def.required.push(fieldName);
			// }

			// // common props
			// def.properties[fieldName] = {
			// 	description: node.$$t,
			// };

			// if (node.type === "object") {
			// 	def.properties[fieldName] = {
			// 		...def.properties[fieldName],
			// 		$ref: `#/components/schemas/${nextSchemeName}`,
			// 	};
			// 	this.createSchemaFromParams(doc, nextSchemeName, node.props, [], node);
			// 	continue;
			// }

			// // array with objects
			// if (node.type === "array" && node.items && node.items.type === "object") {
			// 	def.properties[fieldName] = {
			// 		...def.properties[fieldName],
			// 		type: "array",
			// 		default: node.default,
			// 		unique: node.unique,
			// 		minItems: node.length || node.min,
			// 		maxItems: node.length || node.max,
			// 		items: {
			// 			$ref: `#/components/schemas/${nextSchemeName}`,
			// 		},
			// 	};
			// 	this.createSchemaFromParams(
			// 		doc,
			// 		nextSchemeName,
			// 		node.items.props,
			// 		[],
			// 		node,
			// 	);
			// 	continue;
			// }

			// // simple array
			// if (node.type === "array" || node.type === "tuple") {
			// 	def.properties[fieldName] = {
			// 		...def.properties[fieldName],
			// 		type: "array",
			// 		items: this.getTypeAndExample({
			// 			enum: node.enum,
			// 			type: node.items && node.items.type ? node.items.type : node.items,
			// 			values:
			// 				node.items && node.items.values ? node.items.values : undefined,
			// 		}),
			// 		default: node.default,
			// 		unique: node.unique,
			// 		minItems: node.length || node.min,
			// 		maxItems: node.length || node.max,
			// 	};
			// 	continue;
			// }

			// // string/number/boolean
			// def.properties[fieldName] = {
			// 	...def.properties[fieldName],
			// 	...this.getTypeAndExample(node),
			// };
		}

		if (def.required.length === 0) {
			delete def.required;
		}
	},
	getTypeAndExample(node) {
		if (!node) {
			node = {};
		}
		let out = {};
		let nodeType = node.type;

		if (Array.isArray(nodeType)) {
			nodeType = (nodeType[0] || "string").toString();
		}

		switch (nodeType) {
			case NODE_TYPES.boolean:
				out = {
					example: false,
					type: "boolean",
				};
				break;
			case NODE_TYPES.number:
				out = {
					example: null,
					type: "number",
				};
				break;
			case NODE_TYPES.date:
				out = {
					example: "1998-01-10T13:00:00.000Z",
					type: "string",
					format: "date-time",
				};
				break;
			case NODE_TYPES.uuid:
				out = {
					example: "10ba038e-48da-487b-96e8-8d3b99b6d18a",
					type: "string",
					format: "uuid",
				};
				break;
			case NODE_TYPES.email:
				out = {
					example: "foo@example.com",
					type: "string",
					format: "email",
				};
				break;
			case NODE_TYPES.url:
				out = {
					example: "https://example.com",
					type: "string",
					format: "uri",
				};
				break;
			case NODE_TYPES.enum:
				out = {
					type: "string",
					enum: node.values,
					example: Array.isArray(node.values) ? node.values[0] : undefined,
				};
				break;
			default:
				out = {
					example: "",
					type: "string",
				};
				break;
		}

		if (Array.isArray(node.enum)) {
			out.example = node.enum[0];
			out.enum = node.enum;
		}

		if (node.default) {
			out.default = node.default;
			delete out.example;
		}

		out.minLength = node.length || node.min;
		out.maxLength = node.length || node.max;

		/**
		 * by DenisFerrero
		 * @link https://github.com/grinat/moleculer-auto-openapi/issues/13
		 */
		if (
			node.pattern &&
			(node.pattern.length > 0 || node.pattern.source.length > 0)
		) {
			out.pattern = new RegExp(node.pattern).source;
		}

		return out;
	},
	mergePathItemObjects(orig = {}, toMerge = {}) {
		for (const key in toMerge) {
			// merge components
			if (key === "components") {
				orig[key] = this.mergeObjects(orig[key], toMerge[key]);
				continue;
			}

			// merge responses
			if (key === "responses") {
				orig[key] = this.mergeObjects(orig[key], toMerge[key]);

				// iterate codes
				for (const code in orig[key]) {
					// remove $ref if exist content
					if (orig[key][code] && orig[key][code].content) {
						delete orig[key][code].$ref;
					}
				}

				continue;
			}

			// replace non components attributes
			orig[key] = toMerge[key];
		}
		return orig;
	},
	mergeObjects(orig = {}, toMerge = {}) {
		for (const key in toMerge) {
			orig[key] = {
				...(orig[key] || {}),
				...toMerge[key],
			};
		}
		return orig;
	},
	/**
	 * replace // to /
	 * @param path
	 * @returns {string}
	 */
	normalizePath(path = "") {
		path = path.replace(/\/{2,}/g, "/");
		return path;
	},
	/**
	 * convert /:table to /{table}
	 * @param url
	 * @returns {string|string}
	 */
	formatParamUrl(url = "") {
		let start = url.indexOf("/:");
		if (start === -1) {
			return url;
		}

		const end = url.indexOf("/", ++start);

		if (end === -1) {
			return url.slice(0, start) + "{" + url.slice(++start) + "}";
		}

		return this.formatParamUrl(
			url.slice(0, start) +
				"{" +
				url.slice(++start, end) +
				"}" +
				url.slice(end),
		);
	},
	/**
	 * extract params from /{table}
	 * @param url
	 * @returns {[]}
	 */
	extractParamsFromUrl(url = "") {
		const params = [];
		const added = [];

		const matches = [...this.matchAll(/{(\w+)}/g, url)];
		for (const match of matches) {
			const [, name] = match;

			added.push(name);
			params.push({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			});
		}

		return [params, added];
	},
	/**
	 * matchAll polyfill for es8 and older
	 * @param regexPattern
	 * @param sourceString
	 * @returns {[]}
	 */
	matchAll(regexPattern, sourceString) {
		const output = [];
		let match;
		// make sure the pattern has the global flag
		const regexPatternWithGlobal = RegExp(regexPattern, "g");
		while ((match = regexPatternWithGlobal.exec(sourceString)) !== null) {
			// get rid of the string copy
			delete match.input;
			// store the match data
			output.push(match);
		}
		return output;
	},
	// expandShortDefinition(shortDefinition) {
	// 	const node = {
	// 		type: "string",
	// 	};

	// 	if (typeof shortDefinition !== "string") {
	// 		return node;
	// 	}

	// 	let params = shortDefinition.split("|");
	// 	params = params.map((v) => v.trim());

	// 	if (params.includes("optional")) {
	// 		node.optional = true;
	// 	}

	// 	for (const type of Object.values(NODE_TYPES)) {
	// 		if (params.includes(type)) {
	// 			node.type = type;
	// 		} else if (params.includes(`${type}[]`)) {
	// 			const [arrayType] = node.type.split("[");
	// 			node.type = "array";
	// 			node.items = arrayType;
	// 		}
	// 	}

	// 	return node;
	// },
	getFileContentRequestBodyScheme(openapiPath, method, actionType) {
		return {
			content: {
				...(actionType === "multipart"
					? {
							"multipart/form-data": {
								schema: {
									type: "object",
									properties: {
										file: {
											type: "array",
											items: {
												type: "string",
												format: "binary",
											},
										},
										someField: {
											type: "string",
										},
									},
								},
							},
						}
					: {
							"application/octet-stream": {
								schema: {
									type: "string",
									format: "binary",
								},
							},
						}),
			},
		};
	},
	isZod(schema) {
		//This works with https://github.com/TheAppleFreak/moleculer-zod-validator/
		return schema && Object.hasOwnProperty.call(schema, "$$$options");
	},
};
