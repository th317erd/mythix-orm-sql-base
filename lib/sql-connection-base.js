'use strict';

const Nife  = require('nife');
const UUID  = require('uuid');
const {
  ConnectionBase,
  Utils,
  QueryEngine,
  Literals,
  Model: ModelBase,
} = require('mythix-orm');

const SQLQueryGeneratorBase = require('./sql-query-generator-base');

const SAVE_POINT_NAME_CHARS = [ 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P' ];
const MODEL_RELATIONS       = Symbol.for('_mythixModelRelations');

class SQLConnectionBase extends ConnectionBase {
  static DefaultQueryGenerator = SQLQueryGeneratorBase;

  prepareArrayValuesForSQL(_array) {
    let array = Nife.arrayFlatten(_array);

    array = array.filter((item) => {
      if (item === null)
        return true;

      if (Literals.LiteralBase.isLiteral(item))
        return true;

      if (!Nife.instanceOf(item, 'string', 'number', 'bigint', 'boolean'))
        return false;

      return true;
    });

    return Nife.uniq(array);
  }

  generateSavePointName() {
    let id = UUID.v4();

    id = id.toUpperCase().replace(/\d/g, (m) => {
      let index = parseInt(m, 10);
      return SAVE_POINT_NAME_CHARS[index];
    }).replace(/-/g, '');

    return `SP${id}`;
  }

  findAllFieldsFromFieldProjectionMap(projectionFieldMap) {
    let fullFieldNames = (Array.isArray(projectionFieldMap)) ? projectionFieldMap : Array.from(projectionFieldMap.keys());

    return fullFieldNames.map((fullFieldName) => {
      let def = Utils.parseQualifiedName(fullFieldName);
      if (!def.modelName || def.fieldNames.length === 0)
        return fullFieldName;

      let field = this.getField(def.fieldNames[0], def.modelName);
      if (!field)
        return fullFieldName;

      return field;
    }).filter(Boolean);
  }

  buildModelDataMapFromSelectResults(queryEngine, result) {
    if (!result)
      return {};

    let {
      rows,
      columns,
    } = result;
    if (Nife.isEmpty(rows))
      return {};

    const generateIDForModelFields = (data) => {
      let keys  = Object.keys(data || {}).sort();
      let parts = [];

      for (let i = 0, il = keys.length; i < il; i++) {
        let key   = keys[i];
        let value = data[key];

        parts.push(`${key}:${value}`);
      }

      return (!parts.length) ? null : parts.join(',');
    };

    const isEmptyModel = (model) => {
      if (!model)
        return true;

      if (model._mythixIsEmpty === false)
        return false;

      return true;
    };

    let context         = queryEngine.getOperationContext();
    let fields          = this.findAllFieldsFromFieldProjectionMap(columns);
    let rootModelName   = context.rootModelName;
    let modelData       = {};
    let alreadyVisited  = {};

    let fieldInfo = fields.map((field) => {
      if (Nife.instanceOf(field, 'string'))
        return field;

      let Model       = field.Model;
      let modelName   = Model.getModelName();
      let pkFieldName = Model.getPrimaryKeyFieldName();

      return {
        pkFieldName,
        field,
        Model,
        modelName,
      };
    });

    let modelInfo = fieldInfo.reduce((obj, info) => {
      if (Nife.instanceOf(info, 'string'))
        return obj;

      obj[info.modelName] = info;
      return obj;
    }, {});

    // Remap row
    let modelNames = Object.keys(modelInfo).sort((a, b) => {
      if (a === rootModelName)
        return -1;

      if (b === rootModelName)
        return 1;

      if (a === b)
        return 0;

      return (a < b) ? -1 : 1;
    });

    for (let i = 0, il = rows.length; i < il; i++) {
      let row   = rows[i];
      let data  = {};

      // Collect row
      for (let j = 0, jl = fieldInfo.length; j < jl; j++) {
        let thisFieldInfo = fieldInfo[j];
        let fieldName;
        let modelName;

        if (Nife.instanceOf(thisFieldInfo, 'string')) {
          let def = Utils.parseQualifiedName(thisFieldInfo);
          if (!def.modelName)
            continue;

          if (Nife.isEmpty(def.fieldNames))
            continue;

          modelName = def.modelName;
          fieldName = def.fieldNames[0];
        } else {
          modelName = thisFieldInfo.modelName;
          fieldName = thisFieldInfo.field.fieldName;
        }

        let dataContext = data[modelName];
        let remoteValue = row[j];

        if (!dataContext)
          dataContext = data[modelName] = {};

        // Track empty models (can happen for left or right table joins)
        if (remoteValue != null && !Object.prototype.hasOwnProperty.call(dataContext, '_mythixIsEmpty')) {
          Object.defineProperties(dataContext, {
            '_mythixIsEmpty': {
              writable:     true,
              enumerable:   false,
              configurable: true,
              value:        false,
            },
          });
        }

        dataContext[fieldName] = remoteValue;
      }

      let rootModel;
      for (let j = 0, jl = modelNames.length; j < jl; j++) {
        let modelName = modelNames[j];
        let model     = data[modelName];
        if (isEmptyModel(model))
          continue;

        let info        = modelInfo[modelName];
        let models      = modelData[modelName];
        let pkFieldName = info.pkFieldName;
        let index;

        if (!models)
          models = modelData[modelName] = [];

        let id = model[pkFieldName];
        if (id == null)
          id = generateIDForModelFields(model);

        if (id != null) {
          let idKey = `${modelName}:${pkFieldName}:${id}`;

          if (alreadyVisited[idKey] != null) {
            index = alreadyVisited[idKey];
            model = models[index];
          } else {
            index = alreadyVisited[idKey] = models.length;
            models.push(model);
          }
        } else {
          index = models.length;
          models.push(model);
          continue;
        }

        if (j === 0) {
          rootModel = model;
        } else {
          if (!rootModel[MODEL_RELATIONS]) {
            Object.defineProperties(rootModel, {
              [MODEL_RELATIONS]: {
                writable:     true,
                enumerable:   false,
                configurable: true,
                value:        {},
              },
            });
          }

          if (!rootModel[MODEL_RELATIONS][modelName])
            rootModel[MODEL_RELATIONS][modelName] = [];

          rootModel[MODEL_RELATIONS][modelName].push(index);
        }
      }
    }

    return modelData;
  }

  // eslint-disable-next-line no-unused-vars
  async enableForeignKeyConstraints(enable) {
    throw new Error(`${this.constructor.name}::enableForeignKeyConstraints: This operation is not supported for this connection type.`);
  }

  buildModelsFromModelDataMap(queryEngine, modelDataMap, callback) {
    if (Nife.isEmpty(modelDataMap))
      return [];

    let queryContext  = queryEngine.getOperationContext();
    let rootModelName = queryContext.rootModelName;
    let RootModel     = queryContext.rootModel;
    if (!rootModelName || !RootModel)
      throw new Error(`${this.constructor.name}::buildModelsFromModelDataMap: Root model not found.`);

    let rootModelData = modelDataMap[rootModelName];
    if (Nife.isEmpty(rootModelData))
      return [];

    let callbackIsValid = (typeof callback === 'function');
    let rootModels = rootModelData.map((data) => {
      let model = new RootModel(data);

      if (callbackIsValid)
        model = callback(RootModel, model);

      if (data[MODEL_RELATIONS]) {
        let relationships = data[MODEL_RELATIONS];
        let modelNames    = Object.keys(relationships);

        for (let i = 0, il = modelNames.length; i < il; i++) {
          let modelName           = modelNames[i];
          let Model               = this.getModel(modelName);
          let modelIndexes        = relationships[modelName];
          let models              = modelDataMap[modelName];

          Utils.assignRelatedModels(model, modelIndexes.map((modelIndex) => {
            let modelData = models[modelIndex];
            let thisModel = new Model(modelData);

            if (callbackIsValid)
              thisModel = callback(Model, thisModel);

            return thisModel;
          }));
        }
      }

      model.clearDirty();

      return model;
    });

    return rootModels;
  }

  updateModelsFromResults(Model, storedModels, results) {
    let {
      rows,
      columns,
    } = results;

    for (let i = 0, il = rows.length; i < il; i++) {
      let row         = rows[i];
      let storedModel = storedModels[i];

      for (let j = 0, jl = columns.length; j < jl; j++) {
        let columnName  = columns[j];
        let value       = row[j];

        storedModel[columnName] = value;
      }

      this.setPersisted([ storedModel ], true);
    }

    return storedModels;
  }

  getUpdateOrDeleteChangeCount(queryResult) {
    if (!queryResult)
      return 0;

    if ('rows' in queryResult && Array.isArray(queryResult.rows))
      return queryResult.rows.length;

    if ('changes' in queryResult)
      return queryResult.changes;

    return 0;
  }

  // --------------------------------------------- //

  async dropTable(Model, options) {
    let queryGenerator  = this.getQueryGenerator();
    let createTableSQL  = queryGenerator.generateDropTableStatement(Model, options);

    // Drop table
    return await this.query(createTableSQL, options);
  }

  async createTable(Model, options) {
    let queryGenerator  = this.getQueryGenerator();
    let createTableSQL  = queryGenerator.generateCreateTableStatement(Model, options);

    // Create table
    let result = await this.query(createTableSQL, options);

    // Create indexes and constraints
    let trailingStatements = Nife.toArray(queryGenerator.generateCreateTableStatementOuterTail(Model, options)).filter(Boolean);
    if (Nife.isNotEmpty(trailingStatements)) {
      for (let i = 0, il = trailingStatements.length; i < il; i++) {
        let trailingStatement = trailingStatements[i];
        await this.query(trailingStatement, options);
      }
    }

    return result;
  }

  async insert(Model, models, _options) {
    return await this.bulkModelOperation(
      Model,
      models,
      Object.assign({}, _options || {}, { skipPersisted: true, isInsertOperation: true }),
      // Before model operation handler
      async (Model, models, options) => {
        await this.runSaveHooks(Model, models, 'onBeforeCreate', 'onBeforeSave', options);
      },
      // Operation handler
      async (Model, preparedModels, options, queryGenerator) => {
        let sqlStr  = queryGenerator.generateInsertStatement(Model, preparedModels, options);
        let results = await this.query(sqlStr, options);

        this.updateModelsFromResults(Model, preparedModels.models, results);
      },
      // After model operation handler
      async (Model, models, options) => {
        await this.runSaveHooks(Model, models, 'onAfterCreate', 'onAfterSave', options);
      },
      // After all operations handler
      async (PrimaryModel, dirtyModels, options, queryGenerator) => {
        for (let dirtyModel of dirtyModels) {
          let Model   = dirtyModel.getModel();
          let sqlStr  = queryGenerator.generateUpdateStatement(Model, dirtyModel, null, options);
          let results = await this.query(sqlStr, options);

          this.updateModelsFromResults(Model, [ dirtyModel ], results);
        }
      },
    );
  }

  // eslint-disable-next-line no-unused-vars
  async upsert(Model, models, _options) {
    throw new Error(`${this.constructor.name}::upsert: This operation is not supported for this connection type.`);
  }

  async update(Model, models, _options) {
    let options = _options || {};

    let primaryKeyFieldName = Model.getPrimaryKeyFieldName();
    if (Nife.isEmpty(primaryKeyFieldName))
      throw new Error(`${this.constructor.name}::update: Model has no primary key field.`);

    let result = await this.bulkModelOperation(
      Model,
      models,
      Object.assign({}, options || {}, { isUpdateOperation: true }),
      // Before model operation handler
      async (Model, models, options) => {
        await this.runSaveHooks(Model, models, 'onBeforeUpdate', 'onBeforeSave', options);
      },
      // Operation handler
      async (Model, preparedModels, options, queryGenerator) => {
        let models = preparedModels.models;
        for (let i = 0, il = models.length; i < il; i++) {
          let model = models[i];
          let query = Model.where(this);

          let pkFieldValue = model[primaryKeyFieldName];
          if (!pkFieldValue)
            throw new Error(`${this.constructor.name}::update: Model's primary key is empty. Models being updated must have a valid primary key.`);

          query = query[primaryKeyFieldName].EQ(pkFieldValue);
          query = await this.finalizeQuery('update', query, options);

          let sqlStr = queryGenerator.generateUpdateStatement(Model, model, query, options);
          if (!sqlStr)
            continue;

          let results = await this.query(sqlStr, options);
          this.updateModelsFromResults(Model, [ model ], results);
        }
      },
      // After model operation handler
      async (Model, models, options) => {
        await this.runSaveHooks(Model, models, 'onAfterUpdate', 'onAfterSave', options);
      },
    );

    return (Array.isArray(result)) ? result.length : 1;
  }

  async updateAll(_queryEngine, model, _options) {
    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new Error(`${this.constructor.name}::updateAll: Model class or query is required to update.`);

    let options = Object.assign({}, _options || {}, { isUpdateOperation: true });
    queryEngine = await this.finalizeQuery('update', queryEngine, options);

    let rootModel = queryEngine.getOperationContext().rootModel;
    if (!rootModel)
      throw new Error(`${this.constructor.name}::updateAll: Root model not found, and is required to update.`);

    let queryGenerator  = this.getQueryGenerator();
    let sqlStr          = queryGenerator.generateUpdateStatement(rootModel, model, queryEngine, options);
    return this.getUpdateOrDeleteChangeCount(await this.query(sqlStr, options));
  }

  async destroyModels(Model, _models, _options) {
    if (!ModelBase.isModelClass(Model))
      throw new Error(`${this.constructor.name}::_destroyModels: You must provide a model class as the first argument.`);

    let options = _options || {};
    if (_models == null) {
      if (options.truncate !== true)
        return 0;

      let query           = await this.finalizeQuery('delete', Model.where(this).unscoped(), options);
      let queryGenerator  = this.getQueryGenerator();
      let sqlStr          = queryGenerator.generateDeleteStatement(Model, query, options);

      return await this.query(sqlStr, options);
    }

    let models = Nife.toArray(_models).filter(Boolean);
    if (Nife.isEmpty(models))
      return 0;

    let primaryKeyFieldName = Model.getPrimaryKeyFieldName();
    if (Nife.isEmpty(primaryKeyFieldName))
      throw new Error(`${this.constructor.name}::destroyModels: Model has no primary key field. You must supply a query to delete models with no primary key.`);

    let result = await this.bulkModelOperation(
      Model,
      models,
      Object.assign({}, options, { isDeleteOperation: true }),
      // Before model operation handler
      null,
      // Operation handler
      async (Model, preparedModels, options, queryGenerator) => {
        let models  = preparedModels.models;
        let pkIDs   = [];

        for (let i = 0, il = models.length; i < il; i++) {
          let model         = models[i];
          let pkFieldValue  = model[primaryKeyFieldName];
          if (pkFieldValue != null && Nife.isEmpty(pkFieldValue))
            continue;

          pkIDs.push(pkFieldValue);
        }

        if (Nife.isEmpty(pkIDs))
          return;

        let query   = await this.finalizeQuery('delete', Model.where(this).id.EQ(pkIDs), options);
        let sqlStr = queryGenerator.generateDeleteStatement(Model, query);
        if (!sqlStr)
          return;

        await this.query(sqlStr, options);
      },
    );

    return (Array.isArray(result)) ? result.length : 1;
  }

  async destroy(_queryEngineOrModel, modelsOrOptions, _options) {
    // TODO: Have destroy use "RETURNING" to return deleted PKs

    let queryEngineOrModel = _queryEngineOrModel;

    if (QueryEngine.isQuery(modelsOrOptions))
      queryEngineOrModel = modelsOrOptions;
    else if (queryEngineOrModel && ModelBase.isModelClass(queryEngineOrModel))
      return await this.destroyModels(queryEngineOrModel, modelsOrOptions, _options);
    else if (!QueryEngine.isQuery(queryEngineOrModel))
      throw new Error(`${this.constructor.name}::destroy: Please provide a query, or a model class and a list of models to destroy.`);

    let queryEngine = this.toQueryEngine(queryEngineOrModel);
    if (!queryEngine)
      throw new Error(`${this.constructor.name}::destroy: Model class or query is required to destroy.`);

    let options = modelsOrOptions || {};
    queryEngine = await this.finalizeQuery('delete', queryEngine, options);

    let rootModel = queryEngine.getOperationContext().rootModel;
    if (!rootModel)
      throw new Error(`${this.constructor.name}::destroy: Root model not found, and is required to destroy.`);

    let queryGenerator  = this.getQueryGenerator();
    let sqlStr          = queryGenerator.generateDeleteStatement(rootModel, queryEngine, options);
    return this.getUpdateOrDeleteChangeCount(await this.query(sqlStr, options));
  }

  queryResultRowsToRawData(result) {
    if (!result)
      return [];

    let { columns, rows } = result;
    if (Nife.isEmpty(columns) || Nife.isEmpty(rows))
      return [];

    let finalData = [];
    for (let i = 0, il = rows.length; i < il; i++) {
      let row   = rows[i];
      let data  = {};

      for (let j = 0, jl = columns.length; j < jl; j++) {
        let column = columns[j];
        data[column] = row[j];
      }

      finalData.push(data);
    }

    return finalData;
  }

  async *select(_queryEngine, _options) {
    let queryEngine = _queryEngine;
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::select: First argument must be a model class or a query.`);

    if (!QueryEngine.isQuery(queryEngine)) {
      if ('where' in queryEngine)
        queryEngine = queryEngine.where(this);
      else
        throw new TypeError(`${this.constructor.name}::select: First argument must be a model class or a query.`);
    }

    let options         = _options || {};
    let queryGenerator  = this.getQueryGenerator();

    queryEngine = await this.finalizeQuery('read', queryEngine, options);

    let queryContext  = queryEngine.getOperationContext();
    let groupBy       = queryContext.groupBy;
    if (groupBy && groupBy.size > 0) {
      let sqlStatement  = queryGenerator.generateSelectStatement(queryEngine, options);
      let result        = await this.query(sqlStatement, options);
      let rows          = this.queryResultRowsToRawData(result);

      for (let i = 0, il = rows.length; i < il; i++)
        yield rows[i];

      return;
    }

    let batchSize   = options.batchSize || 500;
    let startIndex  = queryContext.offset || 0;

    while (true) {
      let query         = queryEngine.clone().LIMIT(batchSize).OFFSET(startIndex);
      let sqlStatement  = queryGenerator.generateSelectStatement(query, options);
      let result        = await this.query(sqlStatement, options);

      if (!result.rows || result.rows.length === 0)
        break;

      startIndex += result.rows.length;

      if (options.raw === true) {
        yield result;
      } else {
        let modelDataMap  = this.buildModelDataMapFromSelectResults(queryEngine, result);
        let models        = this.buildModelsFromModelDataMap(queryEngine, modelDataMap, (_, model) => {
          model._persisted = true;
          return model;
        });

        for (let i = 0, il = models.length; i < il; i++) {
          let model = models[i];

          model.__order = i;

          yield model;
        }
      }

      if (result.rows.length < batchSize)
        break;
    }
  }

  async aggregate(_queryEngine, _literal, options) {
    let literal = _literal;

    if (!Literals.LiteralBase.isLiteral(literal))
      throw new Error(`${this.constructor.name}::aggregate: Second argument must be a Literal instance.`);

    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::aggregate: First argument must be a model class or a query.`);

    queryEngine = await this.finalizeQuery('read', queryEngine, options);
    queryEngine = queryEngine.clone();

    let queryGenerator  = this.getQueryGenerator();
    let queryContext    = queryEngine.getOperationContext();
    let distinct        = queryContext.distinct;

    if (distinct) {
      let distinctField = distinct.getField(this);
      if (distinctField) {
        if (Literals.LiteralBase.isLiteral(distinctField)) {
          let field = distinctField.getField(this);
          if (!field)
            field = distinctField.valueOf();

          if (field)
            distinctField = field;
        }

        if (typeof distinctField.isField === 'function' && distinctField.isField(distinctField))
          distinctField = new Literals.Literal(`DISTINCT ${queryGenerator.getEscapedColumnName(distinctField.Model, distinctField)}`, { isAggregate: true });
        else
          distinctField = new Literals.Literal(`DISTINCT ${distinctField.toString(this, { isAggregate: true })}`, { isAggregate: true });

        let LiteralConstructor = literal.constructor;
        literal = new LiteralConstructor(distinctField);

        queryEngine = queryEngine.DISTINCT(false);
      }
    }

    let literalStr  = literal.toString(this);
    let query       = queryEngine.PROJECT(literal).ORDER(); // TODO: Remove ORDER here once aggregate ORDER BY is fixed
    let sqlStr      = queryGenerator.generateSelectStatement(query, this.stackAssign(options, { isAggregate: true }));
    let result      = await this.query(sqlStr, options);
    let columnIndex = result.columns.indexOf(literalStr);
    if (columnIndex < 0) {
      if (result.columns.length === 1)
        columnIndex = 0;
      else
        throw new Error(`${this.constructor.name}::aggregate: Can not find specified column in results.`);
    }

    return result.rows[0][columnIndex];
  }

  async average(_queryEngine, _field, options) {
    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::average: First argument must be a model class or a query.`);

    let rootModel = queryEngine.getOperationContext().rootModel;
    let field     = Utils.fieldToFullyQualifiedName(_field, rootModel);

    return await this.aggregate(queryEngine, new Literals.AverageLiteral(field), options);
  }

  async count(_queryEngine, _field, options) {
    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::count: First argument must be a model class or a query.`);

    queryEngine = await this.finalizeQuery('read', queryEngine, options);

    let rootModel = queryEngine.getOperationContext().rootModel;
    let field     = (_field) ? Utils.fieldToFullyQualifiedName(_field, rootModel) : null;

    return await this.aggregate(queryEngine, new Literals.CountLiteral(field), options);
  }

  async min(_queryEngine, _field, options) {
    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::min: First argument must be a model class or a query.`);

    queryEngine = await this.finalizeQuery('read', queryEngine, options);

    let rootModel = queryEngine.getOperationContext().rootModel;
    let field     = Utils.fieldToFullyQualifiedName(_field, rootModel);

    return await this.aggregate(queryEngine, new Literals.MinLiteral(field), options);
  }

  async max(_queryEngine, _field, options) {
    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::max: First argument must be a model class or a query.`);

    queryEngine = await this.finalizeQuery('read', queryEngine, options);

    let rootModel = queryEngine.getOperationContext().rootModel;
    let field     = Utils.fieldToFullyQualifiedName(_field, rootModel);

    return await this.aggregate(queryEngine, new Literals.MaxLiteral(field), options);
  }

  async sum(_queryEngine, _field, options) {
    let queryEngine = this.toQueryEngine(_queryEngine);
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::sum: First argument must be a model class or a query.`);

    queryEngine = await this.finalizeQuery('read', queryEngine, options);

    let rootModel = queryEngine.getOperationContext().rootModel;
    let field     = Utils.fieldToFullyQualifiedName(_field, rootModel);

    return await this.aggregate(queryEngine, new Literals.SumLiteral(field), options);
  }

  async pluck(_queryEngine, _fields, _options) {
    if (_options && !Nife.instanceOf(_options, 'object'))
      throw new TypeError(`${this.constructor.name}::pluck: "options" isn't an object. Did you pass a field by accident?`);

    let options                   = _options || {};
    let moreThanOneFieldRequested = (Array.isArray(_fields) && _fields.length > 1);
    let fields                    = Nife.arrayFlatten(Nife.toArray(_fields)).filter(Boolean);

    if (Nife.isEmpty(fields))
      throw new Error(`${this.constructor.name}::pluck: You must supply "fields" to pluck.`);

    let queryEngine = _queryEngine;
    if (!queryEngine)
      throw new TypeError(`${this.constructor.name}::pluck: First argument must be a model class or a query.`);

    if (!QueryEngine.isQuery(queryEngine)) {
      if ('where' in queryEngine)
        queryEngine = queryEngine.where(this);
      else
        throw new TypeError(`${this.constructor.name}::pluck: First argument must be a model class or a query.`);
    }

    queryEngine = await this.finalizeQuery('read', queryEngine, options);

    let queryContext  = queryEngine.getOperationContext();
    let rootModel     = queryContext.rootModel;
    let rootModelName = rootModel.getModelName();

    // remap fields so they have fully qualified names
    fields = fields.map((field) => {
      let def = this.parseQualifiedName(field);
      if (!def.modelName)
        def.modelName = rootModelName;

      if (Nife.isEmpty(def.fieldNames))
        throw new Error(`${this.constructor.name}::pluck: Do not know how to map to field "${field}".`);

      return `${def.modelName}:${def.fieldNames[0]}`;
    });

    let queryGenerator    = this.getQueryGenerator();
    let query             = queryEngine.clone().PROJECT(fields);
    let sqlStr            = queryGenerator.generateSelectStatement(query, options);
    let result            = await this.query(sqlStr, options);
    let finalResults      = [];
    let { columns, rows } = result;
    let columnIndexMap    = fields.reduce((obj, field) => {
      obj[field] = columns.indexOf(field);
      return obj;
    }, {});

    if (options.mapToObjects) {
      finalResults = rows.map((row) => {
        let obj = {};
        for (let i = 0, il = fields.length; i < il; i++) {
          let field       = fields[i];
          let columnIndex = columnIndexMap[field];
          if (columnIndex < 0) {
            obj[fields] = undefined;
            continue;
          }

          obj[field] = row[columnIndex];
        }

        return obj;
      });
    } else {
      finalResults = rows.map((row) => {
        return fields.map((field) => {
          let columnIndex = columnIndexMap[field];
          if (columnIndex < 0)
            return;

          return row[columnIndex];
        });
      });
    }

    if (!moreThanOneFieldRequested)
      finalResults = finalResults.map((row) => row[0]);

    return finalResults;
  }

  async exists(queryEngine, options) {
    let count = await this.count(queryEngine, null, options);
    return (count > 0);
  }

  // Alter operations

  async alterTable(Model, newModelAttributes, options) {
    let queryGenerator  = this.getQueryGenerator();
    let sqlStatements   = queryGenerator.generateAlterTableStatement(Model, newModelAttributes, options);

    for (let i = 0, il = sqlStatements.length; i < il; i++) {
      let sqlStr = sqlStatements[i];
      await this.query(sqlStr, options);
    }
  }

  async dropColumn(Field, options) {
    let queryGenerator  = this.getQueryGenerator();
    let sqlStr          = queryGenerator.generateDropColumnStatement(Field, options);
    if (sqlStr)
      await this.query(sqlStr, options);
  }

  async alterColumn(Field, newFieldAttributes, options) {
    let queryGenerator  = this.getQueryGenerator();
    let sqlStatements   = queryGenerator.generateAlterColumnStatements(Field, newFieldAttributes, options);

    for (let i = 0, il = sqlStatements.length; i < il; i++) {
      let sqlStr = sqlStatements[i];
      await this.query(sqlStr, options);
    }
  }

  async addColumn(Field, options) {
    let queryGenerator  = this.getQueryGenerator();
    let sqlStr          = queryGenerator.generateAddColumnStatement(Field, options);
    if (sqlStr)
      await this.query(sqlStr, options);
  }

  async addIndex(Model, indexFieldNames, options) {
    let queryGenerator  = this.getQueryGenerator();
    let sqlStr          = queryGenerator.generateCreateIndexStatement(Model, indexFieldNames, options);
    if (sqlStr)
      await this.query(sqlStr, options);
  }

  async dropIndex(Model, indexFieldNames, options) {
    let queryGenerator  = this.getQueryGenerator();
    let sqlStr          = queryGenerator.generateDropIndexStatement(Model, indexFieldNames, options);
    if (sqlStr)
      await this.query(sqlStr, options);
  }
}

module.exports = SQLConnectionBase;
