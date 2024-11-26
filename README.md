# moleculer-auto-zod-openapi
Auto generate openapi(swagger) scheme for molecular and zod (together with https://github.com/TheAppleFreak/moleculer-zod-validator)

## Install
```shell script
npm i moleculer-auto-zod-openapi --save
```

## Usage
Create openapi.service.js with content:
```javascript
const Openapi = require("moleculer-auto-zod-openapi");

module.exports = {
  name: 'openapi',
  mixins: [Openapi],
  settings: {
    // all setting optional
    openapi: {
      info: {
        // about project
        description: "Foo",
        title: "Bar",
      },
      tags: [
        // you tags
        { name: "auth", description: "My custom name" },
      ],
      components: {
        // you auth
        securitySchemes: {
          myBasicAuth: {
            type: 'http',
            scheme: 'basic',
          },
        },
      },
    },
  },
}
```
And add resolvers to your webapi service:
```javascript
module.exports = {
  name: `api`,
  mixins: [ApiGateway],
  settings: {
    routes: [
      // moleculer-auto-zod-openapi routes
      {
        path: '/api/openapi',
        aliases: {
          'GET /openapi.json': 'openapi.generateDocs', // swagger scheme
          'GET /ui': 'openapi.ui', // ui
          'GET /assets/:file': 'openapi.assets', // js/css files
        },
      },
    ],
  },
};
```

Use https://github.com/TheAppleFreak/moleculer-zod-validator to describe params :

```ts
// It's easier to set up your validator objects outside of the service constructor so you can more easily access the typings later.
const simpleValidator = new ZodParams({
    string: z.string(),
    number: z.number(),
    optional: z.any().optional()
});

const complexValidator = new ZodParams({
    string: z.string(),
    number: z.number(),
    object: z.object({
        nestedString: z.string(),
        nestedBoolean: z.boolean()
    })
}, {
    partial: true,
    catchall: z.number()
}});

broker.createService({
    name: "example",
    actions: {
        simpleExample: {
            params: simpleValidator.schema, //openapi docs will be generated based on this schema
            handler(ctx: Context<typeof simpleValidator.context>) { ... }
        },
        complexExample: {
            params: complexValidator.schema,
            handler(ctx: Context<typeof complexExample.context>) { ... }
        }
    }
});
```