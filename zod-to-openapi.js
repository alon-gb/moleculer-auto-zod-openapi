const z = require("zod");

const zodToOpenAPI = (zodSchema) => {
	function processZodType(schema) {
		// String
		if (schema instanceof z.ZodString || schema?._def?.typeName === "ZodString") {
			const description = schema._def.description || "";
			const checks = schema._def.checks || [];
			return {
				type: "string",
				description,
				...checks.reduce(
					(acc, check) => {
						if (check.kind === "min") acc.minLength = check.value;
						if (check.kind === "max") acc.maxLength = check.value;
						if (check.kind === "regex") acc.pattern = check.regex.source;
						return acc;
					},
					{}/* as { minLength?: number; maxLength?: number; pattern?: string }*/,
				),
			};
		}

		// Number
		if (schema instanceof z.ZodNumber || schema?._def?.typeName === "ZodNumber") {
			const description = schema._def.description || "";
			const checks = schema._def.checks || [];
			return {
				type: "number",
				description,
				...checks.reduce(
					(acc, check) => {
						if (check.kind === "min") acc.minimum = check.value;
						if (check.kind === "max") acc.maximum = check.value;
						return acc;
					},
					{}/* as { minimum?: number; maximum?: number }*/,
				),
			};
		}

		// Boolean
		if (schema instanceof z.ZodBoolean || schema?._def?.typeName === "ZodBoolean") {
			const description = schema._def.description || "";
			return { type: "boolean", description };
		}

		// Array
		if (schema instanceof z.ZodArray || schema?._def?.typeName === "ZodArray") {
			return {
				type: "array",
				items: processZodType(schema.element),
			};
		}

		// Object
		if (schema instanceof z.ZodObject || schema?._def?.typeName === "ZodObject") {
			const shape = schema.shape/* as { [key: string]: z.ZodType }*/;
			const description = schema._def.description || "";
			const properties/*: Record<string, OpenAPISchema>*/ = {};
			const required/*: string[]*/ = [];

			Object.entries(shape).forEach(([key, value]) => {
				properties[key] = processZodType(value);

				// Check if the field is required
				if (
					!(value instanceof z.ZodOptional) &&
					!(value instanceof z.ZodDefault)
				) {
					required.push(key);
				}
			});

			return {
				type: "object",
				description,
				properties,
				...(required.length > 0 && { required }),
			};
		}

		// Enum
		if (schema instanceof z.ZodEnum || schema?._def?.typeName === "ZodEnum") {
			const description = schema._def.description || "";
			return {
				type: "string",
				description,
				enum: schema._def.values,
			};
		}

		// Union
		if (schema instanceof z.ZodUnion || schema?._def?.typeName === "ZodUnion") {
			const mergeObject = {};
			if (schema._def.description) {		
				mergeObject.description = schema._def.description;
			}
			return {
				...mergeObject,
				oneOf: schema._def.options.map((option/*: z.ZodType*/) =>
					processZodType(option),
				),
			};
		}

		// Nullable
		if (schema instanceof z.ZodNullable || schema?._def?.typeName === "ZodNullable") {
			const mergeObject = {};
            if (schema._def.description) {
                mergeObject.description = schema._def.description;
			}
			return {
				nullable: true,                
				...processZodType(schema.unwrap()),
				...mergeObject,
			};
		}

		// Default
		if (schema instanceof z.ZodDefault || schema?._def?.typeName === "ZodDefault") {
			const mergeObject = {};
            if (schema._def.description) {
                mergeObject.description = schema._def.description;
			}
			return {                
				...processZodType(schema._def.innerType),
				...mergeObject,
			};
		}

		// Optional
		if (schema instanceof z.ZodOptional || schema?._def?.typeName === "ZodOptional") {
			const mergeObject = {};
            if (schema._def.description) {
                mergeObject.description = schema._def.description;
			}
			return {
				...processZodType(schema.unwrap()),
				...mergeObject,
			};
		}
        
        // Pipeline
        if (schema instanceof z.ZodPipeline || schema?._def?.typeName === "ZodPipeline") {
            const mergeObject = {};
            if (schema._def.description) {
                mergeObject.description = schema._def.description;
			}
            return {
				...processZodType(schema._def.out), 
				...mergeObject
			};
        }

		// Default fallback
		return { type: "string", description: `Invalid schema: not a supported zod type ${schema?._def?.typeName}` };
	}

    const schemaCopy = {...zodSchema,};
    delete schemaCopy.$$$options;
	const t = processZodType(z.object(schemaCopy));
	return t;
};

module.exports = zodToOpenAPI;
