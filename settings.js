module.exports = {
	port: process.env.PORT || 3000,
	onlyLocal: false, // build schema from only local services
	schemaPath: "/api/openapi/openapi.json",
	uiPath: "/api/openapi/ui",
	// set //unpkg.com/swagger-ui-dist@3.38.0 for fetch assets from unpkg
	assetsPath: "/api/openapi/assets",
	// names of moleculer-web services which contains urls, by default - all
	collectOnlyFromWebServices: [],
	commonPathItemObjectResponses: {
		200: {
			$ref: "#/components/responses/ReturnedData",
		},
		401: {
			$ref: "#/components/responses/UnauthorizedError",
		},
		422: {
			$ref: "#/components/responses/ValidationError",
		},
		default: {
			$ref: "#/components/responses/ServerError",
		},
	},
	requestBodyAndResponseBodyAreSameOnMethods: [
		/* 'post',
      'patch',
      'put', */
	],
	requestBodyAndResponseBodyAreSameDescription:
		"The answer may vary slightly from what is indicated here. Contain id and/or other additional attributes.",
	openapi: {
		openapi: "3.0.3",
		info: {
			description: "",
			version: "0.0.0",
			title: "Api docs",
		},
		tags: [],
		paths: {},
		components: {
			schemas: {
				// Standart moleculer schemas
				DbMixinList: {
					type: "object",
					properties: {
						rows: {
							type: "array",
							items: {
								type: "object",
							},
						},
						totalCount: {
							type: "number",
						},
					},
				},
				DbMixinFindList: {
					type: "array",
					items: {
						type: "object",
					},
				},
				Item: {
					type: "object",
				},
			},
			securitySchemes: {},
			responses: {
				// Standart moleculer responses
				ServerError: {
					description: "Server errors: 500, 501, 400, 404 and etc...",
					content: {
						"application/json": {
							schema: {
								type: "object",
								example: {
									name: "MoleculerClientError",
									message: "Server error message",
									code: 500,
								},
							},
						},
					},
				},
				UnauthorizedError: {
					description: "Need auth",
					content: {
						"application/json": {
							schema: {
								type: "object",
								example: {
									name: "MoleculerClientError",
									message: "Unauth error message",
									code: 401,
								},
							},
						},
					},
				},
				ValidationError: {
					description: "Fields invalid",
					content: {
						"application/json": {
							schema: {
								type: "object",
								example: {
									name: "MoleculerClientError",
									message: "Error message",
									code: 422,
									data: [
										{ name: "fieldName", message: "Field invalid" },
										{ name: "arrayField[0].fieldName", message: "Whats wrong" },
										{ name: "object.fieldName", message: "Whats wrong" },
									],
								},
							},
						},
					},
				},
				ReturnedData: {
					description: "",
					content: {
						"application/json": {
							schema: {
								oneOf: [
									{
										$ref: "#/components/schemas/DbMixinList",
									},
									{
										$ref: "#/components/schemas/DbMixinFindList",
									},
									{
										$ref: "#/components/schemas/Item",
									},
								],
							},
						},
					},
				},
				FileNotExist: {
					description: "File not exist",
					content: {
						"application/json": {
							schema: {
								type: "object",
								example: {
									name: "MoleculerClientError",
									message: "File missing in the request",
									code: 400,
								},
							},
						},
					},
				},
				FileTooBig: {
					description: "File too big",
					content: {
						"application/json": {
							schema: {
								type: "object",
								example: {
									name: "PayloadTooLarge",
									message: "Payload too large",
									code: 413,
									type: "PAYLOAD_TOO_LARGE",
									data: {
										fieldname: "file",
										filename: "4b2005c0b8.png",
										encoding: "7bit",
										mimetype: "image/png",
									},
								},
							},
						},
					},
				},
			},
		},
	},
};
