'use strict';

const SqlString = require('sqlstring');
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
const MODEL_RELATIONS       = Symbol.for('@_mythix/orm-sql-base/SQLConnectionBase/ModelRelations');

/// `SQLConnectionBase` is a support class for all other
/// SQL connection drivers built for Mythix ORM. It isn't
/// intended to be used on its own, but rather to add SQL
/// support to all other Mythix ORM SQL connections.
///
/// Extends: [ConnectionBase](https://github.com/th317erd/mythix-orm/wiki/ConnectionBase)
class SQLConnectionBase extends ConnectionBase {
  static DefaultQueryGenerator = SQLQueryGeneratorBase;

  /// The low-level DB interface for escaping a
  /// value. By default this function uses the
  /// [sqlstring](https://www.npmjs.com/package/sqlstring)
  /// module to escape values. However, the `escape`
  /// method for whatever database the connection is
  /// using should be used instead of this. This is
  /// a "default implementation" that is meant as a
  /// fallback when a connection doesn't provide its
  /// own, but each connection should provide its own
  /// when it is able.
  ///
  /// Note:
  ///   This method escapes "values" that are given in
  ///   the underlying query language of the database.
  ///   To escape identifiers, use the <see>ConnectionBase._escapeID</see>
  ///   instead.
  ///
  /// Return: string
  ///   The value provided, escaped for the specific
  ///   underlying database driver.
  ///
  /// Arguments:
  ///   value: any
  ///     The value to escape. This could be a number, a boolean,
  ///     a string, or anything else that can be provided to your
  ///     specific database.
  _escape(value) {
    if (Nife.instanceOf(value, 'string'))
      return `'${value.replace(/'/g, '\'\'')}'`;

    return SqlString.escape(value);
  }

  /// Low-level database method for escaping an identifier.
  /// Each database driver should provide its own version of
  /// this method. This is the "default" method Mythix ORM
  /// provides as a "fallback" to database drivers that don't
  /// supply their own.
  ///
  /// It works by first stripping all quotes (single `'`, double `"`, and backtick `` ` ``)
  /// from the provided `value`. After this, it will split on the period (dot) character
  /// `.`, and then will map each resulting part through [sqlstring](https://www.npmjs.com/package/sqlstring)
  /// `escapeId` method, finally re-joining the parts with a period `.` character.
  ///
  /// The extra processing is to allow for already escaped identifiers to not be double-escaped.
  ///
  /// Return: string
  ///   The provided identifier, escaped for the underlying database.
  ///
  /// Arguments:
  ///  value: string
  ///    The identifier to escape.
  _escapeID(value) {
    let parts = value.replace(/['"`]/g, '').split(/\.+/g);
    return parts.map((part) => SqlString.escapeId(part).replace(/^`/, '"').replace(/`$/, '"')).join('.');
  }

  /// Prepare an array of values for use in an `IN` statement.
  /// This method will flatten the provided array, and then
  /// will filter out all non-primitive values from the array.
  /// Only `null`, `boolean`, `number`, `bigint`, and `string`
  /// values will remain in the resulting array. The array is
  /// also reduced to only unique values, with duplicates removed.
  ///
  /// Arguments:
  ///   array: Array<any>
  ///     The array to flatten, filter, and remove duplicates from.
  ///
  /// Return: Array<any>
  ///   Return a copy of the array provided, after being flattened, filtered,
  ///   and duplicates removed.
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

  /// Generate a `SAVEPOINT` name for use in sub-transactions.
  /// This will generate a UUID v4 ID, and then mutate it so
  /// that the name is SQL-safe. Finally, it will add an `SP`
  /// prefix to the `SAVEPOINT` name.
  ///
  /// Return: string
  ///   A random SQL-safe `SAVEPOINT` name.
  generateSavePointName() {
    let id = UUID.v4();

    id = id.toUpperCase().replace(/\d/g, (m) => {
      let index = parseInt(m, 10);
      return SAVE_POINT_NAME_CHARS[index];
    }).replace(/-/g, '');

    return `SP${id}`;
  }

  /// Given a `Map` or an `Array` from a projection field-set, find all matching
  /// projected fields through this connection, and return
  /// them as an array.
  ///
  /// Arguments:
  ///   projectionFieldMap: Map<string, string> | Array<string>
  ///     A set of projected fields, as a `Map` or an `Array`. A `Map` type will usually be generated
  ///     by <see>SQLQueryGeneratorBase.getProjectedFields</see>. The `Map` is expected
  ///     to have fully qualified field names and expanded literal strings as keys, with
  ///     the projected database fields (or literals) in database format for values. As
  ///     an `Array` type, this should be a list of fully qualified field names, or expanded
  ///     literals as values. An `Array` of field names is generally used when the `columns`
  ///     from the database result are passed into this method.
  ///
  /// Return: Array<[Field](https://github.com/th317erd/mythix-orm/wiki/Field) | string>
  ///   All fields found from the projection `Map`. Any field that wasn't able to be
  ///   found on this `connection` will instead just be returned as its raw `string` form.
  ///   Any raw strings returned are likely literals, and so couldn't be matched to fields.
  ///   However, they may not always be literals, but instead may be a custom field or field
  ///   alias that the user requested on the projection.
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

  /// This method will take a `{ rows: Array<any>; columns: Array<string>; }` result from
  /// a `SELECT` statement, and build a map of model data and sub-model data
  /// to be later turned into model instances by <see>SQLConnectionBase.buildModelsFromModelDataMap</see>.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine that was used to generate the `SELECT` statement that returned these results.
  ///   result: { rows: Array<any>; columns: Array<string>; }
  ///     The results as returned by the database, used to build the data map to later construct model instances.
  ///
  /// Return: { [key: string]: Array<object> }
  ///   Return `result` from the database, mapped to the models that were projected. Each key in
  ///   this object will be a model name, and each value an array of model attributes. The model
  ///   attributes in each array of models represents a model instance that will be created later
  ///   using these attributes. There is a special key `Symbol.for('@_mythix/orm-sql-base/SQLConnectionBase/ModelRelations')`
  ///   that can be present on any object of model attributes (a model). This special key--if present--will be
  ///   another mapped object that represents "sub-models" that are "owned" by the model that has this
  ///   special key. This is used when projecting and loading "related models" during a load operation.
  ///
  /// See: SQLConnectionBase.buildModelsFromModelDataMap
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

  /// Take the result from a <see>SQLConnectionBase.buildModelDataMapFromSelectResults</see> call
  /// and instantiate all models defined by the model attribute map.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine that was used to generate the `SELECT` statement that returned these results.
  ///   modelDataMap: { [key: string]: Array<object> }
  ///     The result from a call to <see>SQLConnectionBase.buildModelDataMapFromSelectResults</see>.
  ///   callback?: (RootModel: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model), model: [Model](https://github.com/th317erd/mythix-orm/wiki/Model)) => [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     A callback that is called for each *root model* instance created from the provided `modelDataMap`.
  ///     Sub-models, or other models projected for the operation will not be passed through this callback.
  ///     Only instances of the "root model" (or "target model") of the query will be passed through this
  ///     callback. This callback **must** return the original model instance provided to it, or an equivalent
  ///     model instance (possibly the same instance modified by the callback).
  ///
  /// Return: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)>
  ///   An array of all fully-instantiated "root models" returned from the `SELECT` query, including
  ///   any "sub-models" that were loaded along-side them. All models will be marked "clean".
  ///
  /// See: SQLConnectionBase.buildModelDataMapFromSelectResults
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

  /// Take the `{ rows: Array<any>; columns: Array<string>; }` result from
  /// the database for a `RETURNING` statement, and update the effected models
  /// with the results.
  ///
  /// This is used by `UPDATE` and `INSERT` statements to sync model attributes
  /// with the database update/insert operation that just took place.
  ///
  /// This will also set all models provided to the call as "persisted".
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class of the array of `storedModels` that are being operated upon.
  ///   storedModels: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)>
  ///     The models that were just persisted.
  ///   results: { rows: Array<any>; columns: Array<string>; }
  ///     The raw results from the database, used to update all persisted models.
  ///
  /// Return: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)>
  ///   Return `storedModels`, with each model being updated with the returned results
  ///   from the database, and each model marked as "persisted".
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

  /// Parse the database-specific return value for an
  /// `UPDATE` or `DELETE` operation to retrieve the
  /// number of rows that were updated or deleted.
  ///
  /// Note:
  ///   Each database driver should overload this method to
  ///   properly parse the results of an `UPDATE` or `DELETE`
  ///   statement to return the number of rows affected.
  ///
  /// Arguments:
  ///   queryResult: any
  ///     The raw database response for an `UPDATE` or `DELETE` statement.
  ///
  /// Return: number
  ///   The number of rows that were affected by the operation.
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

  /// For databases that support it, enable or disable foreign key constraints.
  ///
  /// Arguments:
  ///   enable: boolean
  ///     If `true`, enable foreign key constraints in the underlying database, otherwise
  ///     disable foreign key constraints in the underlying database.
  // eslint-disable-next-line no-unused-vars
  async enableForeignKeyConstraints(enable) {
    throw new Error(`${this.constructor.name}::enableForeignKeyConstraints: This operation is not supported for this connection type.`);
  }

  /// Drop the table/bucket defined by `Model`.
  ///
  /// Note:
  ///   Mythix ORM always refers to data-spaces as "tables", even though
  ///   they might actually be "buckets" for example for no-SQL databases.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table to be dropped.
  ///   options?: object
  ///     Though these options can be database specific, they are commonly just
  ///     the following options.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `ifExists` | `boolean` | `false` | Add an `IF EXISTS` clause to the drop table statement. |
  ///     | `cascade` | `boolean` | `true` | Add a `CASCADE` clause to the drop table statement (destroying rows in other tables defined by foreign key constraints). |
  ///
  /// Return: undefined
  ///   This method returns nothing.
  async dropTable(Model, options) {
    let queryGenerator  = this.getQueryGenerator();
    let createTableSQL  = queryGenerator.generateDropTableStatement(Model, options);

    // Drop table
    await this.query(createTableSQL, options);
  }

  /// Create the table/bucket defined by `Model`.
  ///
  /// Note:
  ///   Mythix ORM always refers to data-spaces as "tables", even though
  ///   they might actually be "buckets" for example for no-SQL databases.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table to be created.
  ///   options?: object
  ///     Though these options can be database specific, they are commonly just
  ///     the following options.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `ifNotExists` | `boolean` | `false` | Add an `IF NOT EXISTS` clause to the create table statement. |
  ///
  /// Return: undefined
  ///   This method returns nothing.
  async createTable(Model, options) {
    let queryGenerator  = this.getQueryGenerator();
    let createTableSQL  = queryGenerator.generateCreateTableStatement(Model, options);

    // Create table
    await this.query(createTableSQL, options);

    // Create indexes and constraints
    let trailingStatements = Nife.toArray(queryGenerator.generateCreateTableStatementOuterTail(Model, options)).filter(Boolean);
    if (Nife.isNotEmpty(trailingStatements)) {
      for (let i = 0, il = trailingStatements.length; i < il; i++) {
        let trailingStatement = trailingStatements[i];
        await this.query(trailingStatement, options);
      }
    }
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

  /// Convert the raw `{ rows: Array<any>; columns: Array<string>; }` results
  /// from a database into an array of mapped objects.
  ///
  /// This method simply takes the rows and columns reported by the database
  /// for a `SELECT` operation, and maps them to objects, where each key is
  /// a column name, and each value is a column from one of the returned rows.
  ///
  /// Arguments:
  ///   result: { rows: Array<any>; columns: Array<string>; }
  ///     The raw results as returned by the database.
  ///
  /// Return: Array<object>
  ///   The raw results from the database, with each row mapped to an object.
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
