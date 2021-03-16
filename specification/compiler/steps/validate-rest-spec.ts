/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import assert from 'assert'
import chalk from 'chalk'
import * as model from '../model/metamodel'
import { JsonSpec } from '../model/json-spec'

// This code can be simplified once https://github.com/tc39/proposal-set-methods is available

enum Body {
  noBody = 0,
  yesBody = 1
}

const LOG = 'ALL' // default: ALL

/**
 * Validates the model against the rest-api-spec.
 * It verifies is the model has exactly the same path and query parameters,
 * furthermore it verifies if the body is required or not.
 * If a validation fails, it will log a warning.
 */
export default async function validateRestSpec (model: model.Model, jsonSpec: Map<string, JsonSpec>): Promise<model.Model> {
  for (const endpoint of model.endpoints) {
    if (endpoint.request == null) continue
    const requestDefinition = getProperties(getDefinition(endpoint.request.name))
    if (endpoint.request.name === LOG || LOG === 'ALL') {
      const spec = jsonSpec.get(endpoint.name)
      assert(spec, `Can't find the json spec for ${endpoint.name}`)

      const urlParts = Array.from(new Set(spec.url.paths
        .filter(path => path.parts != null)
        .flatMap(path => {
          assert(path.parts != null)
          return Object.keys(path.parts)
        })
      ))
      const pathProperties = requestDefinition.path.map(property => property.name)
      // are all the parameters in the request definition present in the json spec?
      for (const name of pathProperties) {
        if (!urlParts.includes(name)) {
          console.warn(`The ${chalk.green(endpoint.request.name)} definition has the path parameter ${chalk.green(name)} which is not present in the json spec`)
        }
      }

      // are all the parameters in the json spec present in the request definition?
      for (const name of urlParts) {
        if (!pathProperties.includes(name)) {
          console.warn(`The ${chalk.green(endpoint.request.name)} definition does not include the path parameter ${chalk.green(name)} which is present in the json spec`)
        }
      }

      if (spec.params != null) {
        const params = Object.keys(spec.params)
        const queryProperties = requestDefinition.query.map(property => property.name)
        // are all the parameters in the request definition present in the json spec?
        for (const name of queryProperties) {
          if (!params.includes(name)) {
            console.warn(`The ${chalk.green(endpoint.request.name)} definition has the query parameter ${chalk.green(name)} which is not present in the json spec`)
          }
        }

        // are all the parameters in the json spec present in the request definition?
        for (const name of params) {
          if (!queryProperties.includes(name)) {
            console.warn(`The ${chalk.green(endpoint.request.name)} definition does not include the query parameter ${chalk.green(name)} which is present in the json spec`)
          }
        }
      }

      if (requestDefinition.body === Body.yesBody && spec.body == null) {
        console.warn(`The ${chalk.green(endpoint.request.name)} definition should not include a body`)
      }

      if (requestDefinition.body === Body.noBody && spec.body != null && spec.body.required === true) {
        console.warn(`The ${chalk.green(endpoint.request.name)} definition should include a body`)
      }
    }
  }

  return model

  function getDefinition (name: string): model.Request | model.Interface {
    for (const type of model.types) {
      if (type.kind === 'request' || type.kind === 'interface') {
        if (type.name.name === name) {
          return type
        }
      }
    }
    throw new Error(`Can't find the request definiton for ${name}`)
  }

  // recursively gets the properties from the current and inherited classes
  function getProperties (definition: model.Request | model.Interface): { path: model.Property[], query: model.Property[], body: Body } {
    const path: model.Property[] = []
    const query: model.Property[] = []
    let body: Body = Body.noBody

    if (definition.kind === 'request') {
      if (definition.path.length > 0) {
        path.push(...definition.path)
      }

      if (definition.query.length > 0) {
        query.push(...definition.query)
      }

      if (definition.body != null) {
        body = Body.yesBody
      }
    } else {
      if (definition.properties.length > 0) {
        query.push(...definition.properties)
      }
    }

    if (Array.isArray(definition.inherits)) {
      const inherits = definition.inherits.map(inherit => getDefinition(inherit.type.name))
      for (const inherit of inherits) {
        const properties = getProperties(inherit)
        if (properties.path.length > 0) {
          path.push(...properties.path)
        }

        if (properties.query.length > 0) {
          query.push(...properties.query)
        }

        if (body !== properties.body) {
          body = properties.body
        }
      }
    }

    return { path, query, body }
  }
}