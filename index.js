const fs = require('fs');
const Mustache = require('mustache');

console.log('Generate Swagger React client API');

const args = {
  input: './swagger.json',
  output: './generated.js',
  template: 'es6',
  flat: false,
  customTemplate: undefined
};

for (let i = 0; i < process.argv.length; i++) {
  const item = process.argv[i];
  switch (item) {
    case '-I':
      args.input = process.argv[++i];
      break;
    case '-O':
      args.output = process.argv[++i];
      break;
    case '-T':
      args.template = process.argv[++i];
      break;
    case '-C':
      args.customTemplate = process.argv[++i];
      break;
    case '-F':
      args.flat = true;
      break;
    default:
  }
}

const templatePath = args.customTemplate ? args.customTemplate : __dirname + `/templates/${args.template}.mustache`;
const flatParameters = args.flat;

const data = fs.readFileSync(args.input, {encoding: 'utf8', flag: 'r'});
const template = fs.readFileSync(templatePath, {encoding: 'utf8', flag: 'r'});

let parsed;
try {
  parsed = JSON.parse(data);
} catch (e) {
  console.error(e);
  return;
}

const info = parsed.info || {};
const paths = parsed.paths || {};
const components = parsed.components || {};
const schemas = components.schemas || {};
const definitions = parsed.definitions || {};
const defaultConsumes = parsed.consumes || [];
const defaultProduces = parsed.produces || [];

const capitalize = str => {
  if (typeof str !== 'string') {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const parseMethodName = (url, method) => {
  return url.split('/').map((part, index) => {
    const tmp = part.split('{').join('').split('}').join('').split('.').join('')
      .split('_').map((part, index2) => index > 1 || index2 >= 1 ? capitalize(part) : part).join('')
      .split('-').map((part, index2) => index > 1 || index2 >= 1 ? capitalize(part) : part).join('');
    return index > 1 ? capitalize(tmp) : tmp;
  }).join('') + capitalize(method);
};

const parseClassName = tags => tags.map(tag => tag.split(' ').map(part => capitalize(part)).join('').split('-').map(part => capitalize(part)).join('')).join('') + 'Api';

const parseSchemaRef = schemaRef => {
  if (!schemaRef) {
    return 'any';
  }
  const tmp = schemaRef.split('/');
  return tmp[tmp.length - 1];
};

const parseSchema = schema => {
  if (!schema) {
    return 'any';
  } else if (schema.type === 'array') {
    return parseSchema(schema.items) + '[]';
  } else if (schema.type === 'string') {
    return 'string';
  } else if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  } else {
    return parseSchemaRef(schema['$ref']);
  }
};

const isSchemaArray = schema => !!schema && schema.type === 'array';

const models = [];
const enums = [];
const types = {...definitions, ...schemas};
Object.keys(types).forEach(schemaName => {
  const schema = types[schemaName];
  let name = schemaName;
  if (!schema.enum) {
    const properties = [];
    Object.keys(schema.properties || {}).forEach(name => {
      const propertie = schema.properties[name];
      name = name.split('-').join('_');
      if (propertie.enum) {
        const enumName = parseMethodName(schemaName + '-' + name);
        enums.push({
          name: enumName,
          value: propertie.enum.map(item => '"' + item + '"').join(' | ') || 'any',
          type: propertie.type
        });
        properties.push({
          name: name,
          ...propertie,
          type: enumName
        });
      } else {
        properties.push({
          name,
          ...propertie,
          type: parseSchema(propertie)
        });
      }
    });
    models.push({
      name,
      ...schema,
      properties
    });
  } else {
    enums.push({
      name,
      value: schema.enum.map(item => '"' + item + '"').join(' | ') || 'any',
      type: schema.type
    });
  }
});

const apisByName = {};
const apis = [];
Object.keys(paths).forEach(url => {
  const path = paths[url];
  Object.keys(path).forEach(method => {
    const endpoint = path[method];
    const tags = endpoint.tags || [];
    const parameters = endpoint.parameters || [];
    let noParameters = false;
    let noPathParameters = true;
    let noBodyParameters = true;
    let noHeaderParameters = true;
    let noRequestBody = false;
    let bodyVariable = null;
    if (parameters.length) {
      parameters[parameters.length - 1].last = true;
      parameters.forEach(parameter => {
        parameter.type = parseSchema(parameter.schema ? parameter.schema : parameter);
        parameter.isArray = isSchemaArray(parameter.schema ? parameter.schema : parameter);
        parameter.nullable = !!parameter.schema?.nullable | !parameter.required;
        parameter.inPath = parameter.in === 'path';
        if (parameter.inPath) {
          noPathParameters = false;
        }
        parameter.inBody = parameter.in === 'body';
        if (parameter.in === 'body') {
          bodyVariable = parameter.name;
          noBodyParameters = false;
        }
        parameter.inHeader = parameter.in === 'header';
        if (parameter.in === 'header') {
          noHeaderParameters = false;
          parameter.headerName = parameter.name;
          parameter.name = parseMethodName(parameter.name);
        }
        parameter.inQuery = parameter.in === 'query';
        parameter.inForm = parameter.in === 'formData';
      });
    } else {
      noParameters = true;
    }
    const requestBody = endpoint.requestBody;
    let bodySchema = 'any';
    let jsonBody = false;
    let formBody = false;
    let multipart = false;
    if (requestBody) {
      const bodyContent = requestBody.content || {};
      const bodySchemas = Object.keys(bodyContent).map(requestType => {
        return {name: requestType, ...bodyContent[requestType]};
      });
      if (bodySchemas.length) {
        bodySchema = parseSchema(bodySchemas[0].schema);
        jsonBody = !!bodySchemas.find(item => item.name.indexOf('json') !== -1);
        formBody = !!bodySchemas.find(item => item.name.indexOf('form') !== -1);
        multipart = !!bodySchemas.find(item => item.name.indexOf('multipart') !== -1);
      }
    } else {
      noRequestBody = true;
      const consumes = endpoint.consumes || defaultConsumes;
      if (!noBodyParameters) {
        jsonBody = !!consumes.find(item => item.indexOf('json') !== -1);
      }
      formBody = !!consumes.find(item => item.indexOf('form') !== -1);
      multipart = !!consumes.find(item => item.indexOf('multipart') !== -1);
    }
    const responses = endpoint.responses || {};
    const className = parseClassName(tags);
    const name = parseMethodName(url, method);
    const status200 = responses['200'] || {};
    const content = status200.content || {};
    let schema = 'any';
    let jsonContent = false;
    let textContent = false;
    const responseSchemas = Object.keys(content).map(responseType => {
      return {name: responseType, ...content[responseType]};
    });
    const produces = endpoint.produces || defaultProduces;
    if (responseSchemas.length) {
      schema = parseSchema(responseSchemas[0].schema);
      jsonContent = !!responseSchemas.find(item => item.name.indexOf('json') !== -1);
      textContent = !!responseSchemas.find(item => item.name.indexOf('text') !== -1);
    } else if (produces.length) {
      jsonContent = !!produces.find(item => item.indexOf('json') !== -1);
      textContent = !!produces.find(item => item.indexOf('text') !== -1);
    }
    if (!apisByName[className]) {
      apisByName[className] = {
        methods: []
      };
    }
    const isGet = method === 'get';
    const nameCaps = capitalize(name);
    apisByName[className].methods.push({
      name,
      nameCaps,
      url,
      method,
      isGet,
      parameters,
      noParameters,
      noBodyParameters,
      noHeaderParameters,
      noPathParameters,
      noRequestBody,
      bodyVariable,
      jsonBody,
      formBody,
      multipart,
      bodySchema,
      jsonContent,
      textContent,
      schema
    });
  });
});

Object.keys(apisByName).forEach(name => {
  apis.push({
    name,
    ...apisByName[name]
  });
});

const result = Mustache.render(template, {apis, models, enums, info, flatParameters});

fs.writeFileSync(args.output, result, {flag: 'w+'});

console.log('DONE');
