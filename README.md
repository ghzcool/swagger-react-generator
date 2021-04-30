# swagger-react-generator
Generate client API for React based on Swagger JSON

##Usage
<pre>
node node_modules/swagger-react-generator -I /swagger.json -O /src/generated-api/index.js
</pre>

>**\-I** Input path to swagger.json file.

>**\-O** Output path to client api file location.

>**\-T** Template name. There are 2 templates implemented: "es6" as default and "ts".

>**\-F** Flat args. If defined then api functions will receive flat list of arguments.

>**\-C** Custom template path.
