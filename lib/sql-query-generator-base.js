'use strict';

const Nife = require('nife');
const {
  Types,
  QueryEngine,
  Utils,
  Literals,
  Model: ModelBase,
  Field,
  QueryGeneratorBase,
} = require('mythix-orm');

const DefaultHelpers  = Types.DefaultHelpers;
const LiteralBase     = Literals.LiteralBase;

class SQLQueryGeneratorBase extends QueryGeneratorBase {
  prepareArrayValuesForSQL(array) {
    return this.connection.prepareArrayValuesForSQL(array);
  }

  parseFieldProjection = (str, getRawField) => {
    let modelName;
    let fieldName;
    let projectionField;

    str.replace(/(AS\s+)?"(\w+):([\w.]+)"/i, (m, as, _modelName, _fieldName) => {
      modelName = _modelName;
      fieldName = _fieldName;
    });

    if (!modelName || !fieldName) {
      // Reverse search model and field name
      // based on table and column name
      str.replace(/"([^"]+)"."([^"]+)"/i, (m, _tableName, _columnName) => {
        this.connection.findModelField(({ field, stop }) => {
          if (field.columnName !== _columnName)
            return;

          let tableName = field.Model.getTableName(this.connection);
          if (tableName !== _tableName)
            return;

          if (getRawField) {
            projectionField = field;

            stop();

            return;
          }

          modelName = field.Model.getModelName();
          fieldName = field.fieldName;

          stop();
        });
      });

      if (getRawField && projectionField)
        return projectionField;
    }

    if (getRawField && modelName && fieldName) {
      let field = this.connection.getField(fieldName, modelName);
      if (field)
        return field;
    } else if (!modelName || !fieldName) {
      return str;
    }

    return `${modelName}:${fieldName}`;
  };

  parseFieldProjectionToFieldMap(selectStatement) {
    let firstPart           = selectStatement.replace(/[\r\n]/g, ' ').split(/\s+FROM\s+/i)[0].replace(/^SELECT\s+/i, '').trim();
    let fieldParts          = firstPart.split(',');
    let projectionFieldMap  = new Map();

    for (let i = 0, il = fieldParts.length; i < il; i++) {
      let fieldPart = fieldParts[i].trim();
      let field     = this.parseFieldProjection(fieldPart, true);

      if (field !== fieldPart)
        projectionFieldMap.set(`${field.Model.getModelName()}:${field.fieldName}`, this.getEscapedProjectionName(field.Model, field));
      else
        projectionFieldMap.set(field, field);

      // If this isn't a field, then add it
      if (!this.isFieldIdentifier(fieldPart))
        projectionFieldMap.set(fieldPart, fieldPart);
    }

    return projectionFieldMap;
  }

  generateSelectQueryFieldProjection(queryEngine, options, asMap) {
    let projectedFields = this.getProjectedFields(queryEngine, options, asMap);

    if (asMap === true) {
      return projectedFields;
    } else {
      let projectedFieldList = Array.from(projectedFields.values()).join(',');

      let distinct = queryEngine.getOperationContext().distinct;
      if (distinct) {
        let result = distinct.toString(this.connection, { isProjection: true });
        return `${result} ${projectedFieldList}`;
      }

      return projectedFieldList;
    }
  }

  // eslint-disable-next-line no-unused-vars
  generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, valueIsReference, options) {
    if (LiteralBase.isLiteral(operator))
      return operator.toString(this.connection);

    switch (operator) {
      case 'EQ':
        if (valueIsReference)
          return '=';

        if (value === null || value === true || value === false)
          return 'IS';
        else if (Array.isArray(value))
          return 'IN';
        else
          return '=';
      case 'NEQ':
        if (valueIsReference)
          return '!=';

        if (value === null || value === true || value === false)
          return 'IS NOT';
        else if (Array.isArray(value))
          return 'NOT IN';
        else
          return '!=';
      case 'GT':
        return '>';
      case 'GTE':
        return '>=';
      case 'LT':
        return '<';
      case 'LTE':
        return '<=';
      case 'LIKE':
        if (valueIsReference)
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "LIKE" operator can not be used for table joins.`);

        if (!Nife.instanceOf(value, 'string'))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "LIKE" operator requires a string for a value.`);

        return 'LIKE';
      case 'NOT_LIKE':
        if (valueIsReference)
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "NOT LIKE" operator can not be used for table joins.`);

        if (!Nife.instanceOf(value, 'string'))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "NOT LIKE" operator requires a string for a value.`);

        return 'NOT LIKE';
      default:
        throw new Error(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Unknown operator "${operator}".`);
    }
  }

  formatLikeValue({ value }) {
    return value;
  }

  // eslint-disable-next-line no-unused-vars
  generateConditionPostfix(context) {
    return '';
  }

  generateSelectQueryCondition(queryPart, _value, options) {
    let value     = _value;
    let field     = queryPart.Field;
    let isNot     = queryPart.not;
    let operator  = (isNot) ? queryPart.inverseOperator : queryPart.operator;

    if (operator === 'EXISTS' || operator === 'NOT EXISTS')
      return `${operator}(${this.generateSelectStatement(value.clone().PROJECT(new Literals.Literal('1')).LIMIT(1).OFFSET(0), this.stackAssign(options, { isSubQuery: true, subQueryOperator: operator }))})`;

    // If the value is an array, then handle the
    // special "IN" case for an array
    if (Array.isArray(value)) {
      if (operator !== 'EQ' && operator !== 'NEQ')
        throw new Error(`${this.constructor.name}::generateSelectQueryCondition: Invalid value provided to operator "${operator}": `, value);

      // Flatten array, filter down to
      // only unique items, and remove
      // anything that we can't match on
      // (such as "undefined", and objects)
      value = this.prepareArrayValuesForSQL(value);

      // Filter out NULL, TRUE, and FALSE,
      // as these will need to be compared
      // with "IS" or "IS NOT" operators
      let specialValues = value.filter((item) => (item === null || item === false || item === true));

      // See what remains (if anything)
      let arrayValues = value.filter((item) => (item !== null && item !== false && item !== true));

      // If we have special values, then build a
      // condition enclosed in parenthesis
      if (specialValues.length > 0) {
        let subParts = specialValues.map((specialValue) => {
          return this.generateSelectQueryCondition(queryPart, specialValue, options);
        });

        if (arrayValues.length > 0)
          subParts.push(this.generateSelectQueryCondition(queryPart, arrayValues, options));

        return `(${subParts.join(' OR ')})`;
      }

      // If no values left in array, then
      // skip condition altogether
      if (Nife.isEmpty(arrayValues))
        throw new Error(`${this.constructor.name}::generateSelectQueryCondition: Array value provided to "${field.fieldName}.${operator}" can not be empty.`);

      // Otherwise, fall-through
      value = arrayValues;
    }

    let escapedColumnName = this.getEscapedColumnName(field.Model, field, options);
    let sqlOperator       = this.generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, false, options);

    if (QueryEngine.isQuery(value)) {
      if (!value.queryHasConditions())
        return '';

      if (Object.prototype.hasOwnProperty.call(queryPart, 'subType') && (queryPart.subType === 'ANY' || queryPart.subType === 'ALL'))
        return `${escapedColumnName} ${sqlOperator} ${queryPart.subType}(${this.generateSelectStatement(value, this.stackAssign(options, { isSubQuery: true, subQueryOperator: queryPart.subType }))})`;

      if (sqlOperator === '=')
        sqlOperator = 'IN';
      else if (sqlOperator === '!=')
        sqlOperator = 'NOT IN';

      return `${escapedColumnName} ${sqlOperator} (${this.generateSelectStatement(value, this.stackAssign(options, { isSubQuery: true, subQueryOperator: sqlOperator }))})`;
    }

    let context = { queryPart, field, sqlOperator, operator, value };
    if (sqlOperator === 'LIKE' || sqlOperator === 'NOT LIKE')
      value = this.formatLikeValue(context);

    let conditionPostfix = this.generateConditionPostfix(context);

    return `${escapedColumnName} ${sqlOperator} ${this.escape(field, value)}${(conditionPostfix) ? ` ${conditionPostfix}` : ''}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateFromTableOrTableJoin(Model, _joinType, options) {
    if (!Model)
      throw new Error(`${this.constructor.name}::generateFromTableOrTableJoin: No valid model provided.`);

    let escapedTableName = this.getEscapedTableName(Model, options);
    let joinType = _joinType;
    if (joinType && LiteralBase.isLiteral(joinType))
      joinType = joinType.toString(this.connection);

    return (joinType) ? `${joinType} ${escapedTableName}` : `FROM ${escapedTableName}`;
  }

  generateSelectJoinOnTableQueryCondition(leftQueryPart, rightQueryPart, leftField, rightField, operator, options) {
    let leftSideEscapedColumnName   = this.getEscapedColumnName(leftField.Model, leftField, options);
    let rightSideEscapedColumnName  = this.getEscapedColumnName(rightField.Model, rightField, options);
    let sqlOperator                 = this.generateSelectQueryOperatorFromQueryEngineOperator(leftQueryPart, operator, undefined, true, options);

    return `${leftSideEscapedColumnName} ${sqlOperator} ${rightSideEscapedColumnName}`;
  }

  generateJoinOnTableQueryConditions(joinInfos, options) {
    if (Nife.isEmpty(joinInfos))
      return '';

    let rootInfo = joinInfos[0];
    let sqlParts = [
      this.generateFromTableOrTableJoin(rootInfo.joinModel, rootInfo.joinType, options),
      'ON',
    ];

    for (let i = 0, il = joinInfos.length; i < il; i++) {
      let joinInfo = joinInfos[i];

      if (i > 0)
        sqlParts.push((joinInfo.leftQueryContext.and) ? 'AND' : 'OR');

      sqlParts.push(this.generateSelectJoinOnTableQueryCondition(joinInfo.rightQueryContext, joinInfo.leftQueryContext, joinInfo.rightSideField, joinInfo.leftSideField, joinInfo.operator, options));
    }

    return sqlParts.join(' ');
  }

  // TODO: Needs to take a join type object
  // eslint-disable-next-line no-unused-vars
  generateSQLJoinTypeFromQueryEngineJoinType(joinType, outer, options) {
    if (!joinType || joinType === 'inner')
      return 'INNER JOIN';
    else if (joinType === 'left')
      return (outer) ? 'LEFT OUTER JOIN' : 'LEFT JOIN';
    else if (joinType === 'right')
      return (outer) ? 'RIGHT OUTER JOIN' : 'RIGHT JOIN';
    else if (joinType === 'full')
      return (outer) ? 'FULL OUTER JOIN' : 'FULL JOIN';
    else if (joinType === 'cross')
      return 'CROSS JOIN';

    return joinType;
  }

  sortJoinRelationOrder(joins) {
    let modelNames = Array.from(joins.keys());

    return Utils.sortModelNamesByDependencyOrder(this.connection, modelNames, (Model, modelName) => {
      let joinInfos     = joins.get(modelName) || [];
      let dependencies  = [];

      for (let i = 0, il = joinInfos.length; i < il; i++) {
        let joinInfo = joinInfos[i];

        if (joinInfo.rightSideModelName !== modelName)
          dependencies.push(joinInfo.rightSideModelName);

        if (joinInfo.leftSideModelName !== modelName)
          dependencies.push(joinInfo.leftSideModelName);
      }

      return dependencies;
    });
  }

  generateSelectQueryJoinTables(queryEngine, options) {
    const addToJoins = (joinInfo) => {
      let items = joins.get(joinInfo.joinModelName);
      if (!items) {
        items = [];
        joins.set(joinInfo.joinModelName, items);
      }

      items.push(joinInfo);
    };

    let query = queryEngine.getOperationStack();
    let joins = new Map();

    for (let i = 0, il = query.length; i < il; i++) {
      let queryPart = query[i];
      if (!(Object.prototype.hasOwnProperty.call(queryPart, 'condition') && queryPart.condition === true))
        continue;

      let operatorValue = queryPart.value;
      if (!QueryEngine.isQuery(operatorValue))
        continue;

      // If the query has a condition, then it is a sub-query
      // not a join
      if (operatorValue.getOperationContext().condition)
        continue;

      let joinType = this.generateSQLJoinTypeFromQueryEngineJoinType(queryPart.joinType, queryPart.joinOuter, options);
      let joinInfo = this.getJoinTableInfoFromQueryContexts(queryPart, operatorValue.getOperationContext(), joinType, options);

      addToJoins(joinInfo);
    }

    // We sort the order of joins because
    // some databases care very much
    let modelNames  = this.sortJoinRelationOrder(joins);
    let sqlParts    = [];

    for (let i = 0, il = modelNames.length; i < il; i++) {
      let modelName = modelNames[i];
      let joinInfos = joins.get(modelName);

      let sqlStr = this.generateJoinOnTableQueryConditions(joinInfos, options);
      sqlParts.push(sqlStr);
    }

    return sqlParts.join(' ');
  }

  generateSelectWhereConditions(queryEngine, options) {
    const logicalCondition = (sqlParts, queryPart) => {
      if (sqlParts.length === 0)
        return '';

      if (queryPart.and)
        return 'AND ';
      else if (queryPart.or)
        return 'OR ';

      return '';
    };

    let query     = queryEngine.getOperationStack();
    let sqlParts  = [];
    let hasValue  = false;

    for (let i = 0, il = query.length; i < il; i++) {
      let queryPart     = query[i];
      let queryOperator = queryPart.operator;
      let queryValue    = queryPart.value;
      let result        = undefined;

      if (Object.prototype.hasOwnProperty.call(queryPart, 'condition')) {
        if (queryPart.condition !== true)
          continue;

        result = this.generateSelectQueryCondition(queryPart, queryValue, options);
      } else if (Object.prototype.hasOwnProperty.call(queryPart, 'logical')) {
        if (queryOperator === 'NOT')
          continue;

        // If we have a value for the logical operator
        // then that means we have a sub-grouping
        if (Object.prototype.hasOwnProperty.call(queryPart, 'value') && QueryEngine.isQuery(queryValue)) {
          result = this.generateSelectWhereConditions(queryValue, options);
          if (result)
            result = `(${result})`;
        }
      }

      if (result) {
        let finalResult = `${logicalCondition(sqlParts, queryPart)}${result}`;

        if (sqlParts[0] !== result && sqlParts.indexOf(finalResult) < 0) {
          sqlParts.push(finalResult);
          hasValue = true;
        }
      }
    }

    if (!hasValue)
      return '';

    // Trim any trailing "NOT", "OR", or "AND"
    // from the parts
    let lastIndex = sqlParts.length;
    // eslint-disable-next-line no-unreachable-loop
    for (let i = sqlParts.length - 1; i >= 0; i--) {
      let part = sqlParts[i];
      if (part === 'NOT' || part === 'OR' || part === 'AND') {
        lastIndex = i;
        continue;
      }

      break;
    }

    if (lastIndex < sqlParts.length)
      sqlParts = sqlParts.slice(0, lastIndex);

    return sqlParts.join(' ');
  }

  generateOrderClause(queryEngine, _options) {
    if (!queryEngine)
      return '';

    if (typeof queryEngine.getOperationContext !== 'function')
      return '';

    let order = this.getQueryEngineOrder(queryEngine, _options);
    if (!order || !order.size)
      return '';

    let options             = _options || {};
    let contextOrderSupport = this.connection.isOrderSupportedInContext(options);
    if (contextOrderSupport === false)
      return '';

    let allModelsUsedInQuery  = queryEngine.getAllModelsUsedInQuery();
    let orderByParts          = [];

    for (let [ fullyQualifiedFieldName, orderScope ] of order) {
      let { value, direction } = orderScope;

      // Only allow fields that are in our projection
      if (options.projectionFields && options.onlyProjectedFields !== false) {
        if (!options.projectionFields.has(fullyQualifiedFieldName) && contextOrderSupport === 'PROJECTION_ONLY')
          continue;
      }

      let finalResult;

      if (Nife.instanceOf(value, 'string')) {
        // Raw string is treated as a literal
        finalResult = value;
      } else if (LiteralBase.isLiteral(value)) {
        finalResult = value.toString(this.connection, options);

        // fullyQualifiedFieldName is the stringified
        // literal here.
        if (options.projectionFields && !options.projectionFields.has(finalResult) && contextOrderSupport === 'PROJECTION_ONLY')
          continue;
      } else {
        if (allModelsUsedInQuery.indexOf(value.Model) < 0)
          continue;

        finalResult = this.getEscapedColumnName(value.Model, value.columnName, options);
      }

      let orderStr;
      if (options.reverseOrder !== true)
        orderStr = (direction === '-') ? 'DESC' : 'ASC';
      else
        orderStr = (direction === '-') ? 'ASC' : 'DESC';

      orderByParts.push(`${finalResult} ${orderStr}`);
    }

    if (Nife.isEmpty(orderByParts))
      return '';

    return `ORDER BY ${orderByParts.join(',')}`;
  }

  generateGroupByClause(queryEngine, _options) {
    if (!queryEngine)
      return '';

    if (typeof queryEngine.getOperationContext !== 'function')
      return '';

    let groupBy = queryEngine.getOperationContext().groupBy;
    if (!groupBy || !groupBy.size)
      return '';

    let options = _options || {};

    let groupByParts  = [];
    for (let groupByScope of groupBy.values()) {
      let { value } = groupByScope;
      let finalResult;

      if (Nife.instanceOf(value, 'string')) {
        // Raw string is treated as a literal
        finalResult = value;
      } else if (LiteralBase.isLiteral(value)) {
        finalResult = value.toString(this.connection, options);
      } else {
        finalResult = this.getEscapedColumnName(value.Model, value.columnName, options);
      }

      groupByParts.push(finalResult);
    }

    if (Nife.isEmpty(groupByParts))
      return '';

    return `GROUP BY ${groupByParts.join(',')}`;
  }

  generateHavingClause(queryEngine, options) {
    let where = this.generateSelectWhereConditions(queryEngine, options);
    return (where) ? `HAVING (${where})` : '';
  }

  generateGroupByAndHavingClause(queryEngine, options) {
    if (!queryEngine)
      return '';

    let sqlParts          = [];
    let groupByStatement  = this.generateGroupByClause(queryEngine, options);
    if (groupByStatement)
      sqlParts.push(groupByStatement);
    else
      return '';

    let having = queryEngine.getOperationContext().having;
    if (having) {
      let havingStatement = this.generateHavingClause(having, options);
      if (havingStatement)
        sqlParts.push(havingStatement);
    }

    return sqlParts.join(' ');
  }

  // eslint-disable-next-line no-unused-vars
  generateLimitClause(limit, options) {
    if (LiteralBase.isLiteral(limit))
      return limit.toString(this.connection);

    return `LIMIT ${limit}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateOffsetClause(offset, options) {
    if (LiteralBase.isLiteral(offset))
      return offset.toString(this.connection);

    return `OFFSET ${offset}`;
  }

  generateSelectOrderLimitOffset(queryEngine, _options) {
    if (!queryEngine)
      return '';

    let options = _options || {};
    let context = queryEngine.getOperationContext();
    let {
      order,
      limit,
      offset,
    } = context;

    let sqlParts = [];
    let hasOrder = false;
    let hasLimit = (Nife.instanceOf(limit, 'number') && isFinite(limit));

    if (options.orderClause !== false && !(options.orderClauseOnlyIfLimited === true && !hasLimit) && this.connection.isOrderSupportedInContext(options)) {
      let result = this.generateOrderClause(queryEngine, options);
      if (result) {
        hasOrder = true;
        sqlParts.push(result);
      }

      if (hasOrder && !hasLimit && options && options.forceLimit) {
        limit = options.forceLimit;
        offset = 0;
      }
    }

    if (!Object.is(limit, Infinity) && Nife.isNotEmpty(limit)) {
      if (this.connection.isLimitSupportedInContext(options)) {
        let result = this.generateLimitClause(limit, options);
        if (result)
          sqlParts.push(result);
      }
    }

    if (Nife.isNotEmpty(offset)) {
      if (this.connection.isLimitSupportedInContext(options)) {
        let result = this.generateOffsetClause(offset, options);
        if (result)
          sqlParts.push(result);
      }
    }

    return sqlParts.join(' ');
  }

  generateWhereAndOrderLimitOffset(queryEngine, _options) {
    let options   = _options || {};
    let sqlParts  = [];

    let where = this.generateSelectWhereConditions(queryEngine, options);
    if (where)
      sqlParts.push(`WHERE ${where}`);

    let orderLimitOffset = this.generateSelectOrderLimitOffset(queryEngine, options);
    if (orderLimitOffset)
      sqlParts.push(orderLimitOffset);

    if (options.separateWhereAndOrder)
      return { where, orderLimitOffset };

    return sqlParts.join(' ');
  }

  generateSelectStatement(_queryEngine, _options) {
    let queryEngine = _queryEngine;
    if (!QueryEngine.isQuery(queryEngine))
      throw new Error(`${this.constructor.name}::generateSelectStatement: A query is required as the first argument.`);

    let options = Object.create(_options || {});
    if (options.includeRelations === true)
      queryEngine = queryEngine.clone().PROJECT('*');

    let rootModel = queryEngine.getOperationContext().rootModel;
    if (!rootModel)
      throw new Error(`${this.constructor.name}::generateSelectStatement: No root model found.`);

    let sqlParts = [ 'SELECT' ];
    let projectionFields;

    options.selectStatement = true;

    projectionFields = this.generateSelectQueryFieldProjection(queryEngine, options, true);
    sqlParts.push(this.generateSelectQueryFieldProjection(queryEngine, options));

    sqlParts.push(this.generateFromTableOrTableJoin(rootModel, undefined, options));
    sqlParts.push(this.generateSelectQueryJoinTables(queryEngine, options));
    let { where, orderLimitOffset } = this.generateWhereAndOrderLimitOffset(queryEngine, this.stackAssign(options, { projectionFields, separateWhereAndOrder: true }));
    if (where)
      sqlParts.push(`WHERE ${where}`);

    sqlParts.push(this.generateGroupByAndHavingClause(queryEngine, options));

    if (orderLimitOffset)
      sqlParts.push(orderLimitOffset);

    let sql = sqlParts.filter(Boolean).join(' ');

    if (options.returnFieldProjection === true)
      return { sql, projectionFields };
    else
      return sql;
  }

  getFieldDefaultValue(field, fieldName, _options) {
    let options       = _options || {};
    let defaultValue  = field.defaultValue;
    if (defaultValue === undefined)
      return;

    if (options.isUpdateOperation && !DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'onUpdate' ]))
      return;

    if (options.isInsertOperation && !DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'onInsert' ]))
      return;

    let useDefaultKeyword = (Object.prototype.hasOwnProperty.call(options, 'useDefaultKeyword')) ? options.useDefaultKeyword : true;
    let escapeValue       = (Object.prototype.hasOwnProperty.call(options, 'escape')) ? options.escape : true;

    if (typeof defaultValue === 'function') {
      if (options.remoteOnly !== true) {
        defaultValue = defaultValue({ field, fieldName, connection: this.connection, _static: true });
      } else if (DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'literal', 'remote' ])) {
        defaultValue = defaultValue({ field, fieldName, connection: this.connection, _static: true });
        escapeValue = false;
      } else {
        return;
      }
    }

    if (LiteralBase.isLiteral(defaultValue)) {
      if (defaultValue.options.escape === false)
        escapeValue = false;

      useDefaultKeyword = (defaultValue.options.noDefaultStatementOnCreateTable !== true);

      if (options.isUpdateOperation || options.isInsertOperation)
        useDefaultKeyword = false;

      if (options.rawLiterals !== true)
        defaultValue = defaultValue.toString(this.connection);
      else
        return defaultValue;
    }

    if (escapeValue)
      defaultValue = this.escape(field, defaultValue);

    if (useDefaultKeyword)
      return `DEFAULT ${defaultValue}`;
    else
      return `${defaultValue}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateIndexName(Model, _indexFieldNames, options) {
    let indexFieldNames = Nife.toArray(_indexFieldNames).filter((index) => {
      return (Nife.instanceOf(index, 'string') && Nife.isNotEmpty(index));
    });

    if (indexFieldNames.length === 0)
      return '';

    let tableName   = Model.getTableName(this.connection);
    let columnNames = indexFieldNames.map((fieldName) => {
      let field = Model.getField(fieldName);
      if (!field)
        throw new Error(`${this.constructor.name}::generateIndexName: Unable to find field named "${fieldName}".`);

      return field.columnName;
    });

    return this.escapeID(`idx_${tableName}_${columnNames.sort().join('_')}`);
  }

  generateCreateIndexStatement(Model, _indexFieldNames, _options) {
    let indexFieldNames = Nife.toArray(_indexFieldNames).filter((fieldName) => {
      if (Nife.isEmpty(fieldName))
        return false;

      return Nife.instanceOf(fieldName, 'string');
    });

    if (Nife.isEmpty(indexFieldNames))
      return '';

    let options           = _options || {};
    let escapedTableName  = this.getEscapedTableName(Model, options);
    let flags             = [];

    if (options.concurrently)
      flags.push('CONCURRENTLY');

    if (options.ifNotExists)
      flags.push('IF NOT EXISTS');

    flags = flags.join(' ');

    let indexName           = this.generateIndexName(Model, indexFieldNames, options);
    let escapedColumnNames  = indexFieldNames.map((fieldName) => {
      let thisField = Model.getField(fieldName);
      if (!thisField)
        throw new Error(`${this.constructor.name}::generateCreateIndexStatement: Unable to find field named "${fieldName}".`);

      return this.getEscapedColumnName(Model, thisField, { ...options, columnNameOnly: true });
    });

    return `CREATE INDEX${(flags) ? ` ${flags}` : ''} ${indexName} ON ${escapedTableName} (${escapedColumnNames.join(',')})`;
  }

  generateDropIndexStatement(Model, _indexFieldNames, _options) {
    let indexFieldNames = Nife.toArray(_indexFieldNames).filter((fieldName) => {
      if (Nife.isEmpty(fieldName))
        return false;

      return Nife.instanceOf(fieldName, 'string');
    });

    if (Nife.isEmpty(indexFieldNames))
      return '';

    let options   = _options || {};
    let flags     = [];
    let postFlags = [];

    if (options.concurrently)
      flags.push('CONCURRENTLY');

    if (options.ifExists)
      flags.push('IF EXISTS');

    if (options.cascade !== false)
      postFlags.push('CASCADE');
    else
      postFlags.push('RESTRICT');

    flags = flags.join(' ');
    postFlags = postFlags.join(' ');

    let indexName = this.generateIndexName(Model, indexFieldNames, options);
    return `DROP INDEX${(flags) ? ` ${flags}` : ''} ${indexName}${(postFlags) ? ` ${postFlags}` : ''}`;
  }

  generateColumnIndexes(Model, field, _options) {
    let indexes = Nife.toArray(field.index).filter((index) => {
      if (index === true)
        return true;

      return (Nife.instanceOf(index, 'string', 'array') && Nife.isNotEmpty(index));
    });

    if (indexes.length === 0)
      return [];

    let options = _options || {};
    return indexes.map((indexNames) => {
      let fieldIndexNames = [ field.fieldName ];
      if (indexNames !== true)
        fieldIndexNames = fieldIndexNames.concat(indexNames);

      return this.generateCreateIndexStatement(Model, fieldIndexNames, options);
    });
  }

  generateDropTableStatement(Model, _options) {
    let options           = _options || {};
    let escapedTableName  = this.getEscapedTableName(Model, options);
    let flags             = [];

    if (options.ifExists)
      flags.push('IF EXISTS');

    flags = flags.join(' ');

    return `DROP TABLE ${flags} ${escapedTableName}${(options.cascade !== false) ? ' CASCADE' : ''}`;
  }

  generateForeignKeyConstraint(field, type, options) {
    let typeOptions = type.getOptions();
    let targetModel = type.getTargetModel(this.connection);
    let targetField = type.getTargetField(this.connection);

    let sqlParts = [
      'FOREIGN KEY(',
      this.getEscapedColumnName(field.Model, field, { ...(options || {}), columnNameOnly: true }),
      ') REFERENCES ',
      this.getEscapedTableName(targetModel, options),
      '(',
      this.getEscapedColumnName(targetModel, targetField, { ...(options || {}), columnNameOnly: true }),
      ')',
    ];

    if (typeOptions.deferred === true) {
      sqlParts.push(' ');
      sqlParts.push('DEFERRABLE INITIALLY DEFERRED');
    }

    if (typeOptions.onDelete) {
      sqlParts.push(' ');
      sqlParts.push(`ON DELETE ${typeOptions.onDelete.toUpperCase()}`);
    }

    if (typeOptions.onUpdate) {
      sqlParts.push(' ');
      sqlParts.push(`ON UPDATE ${typeOptions.onUpdate.toUpperCase()}`);
    }

    return sqlParts.join('');
  }

  // eslint-disable-next-line no-unused-vars
  generateCreateTableStatementInnerTail(Model, options) {
    let fieldParts = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      if (field.type.isForeignKey()) {
        let result = this.generateForeignKeyConstraint(field, field.type);
        if (result)
          fieldParts.push(result);

        return;
      }
    });

    return fieldParts;
  }

  // eslint-disable-next-line no-unused-vars
  generateCreateTableStatementOuterTail(Model, options) {
    let fieldParts = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      if (field.type.isForeignKey())
        return;

      if (!field.index)
        return;

      let result = this.generateColumnIndexes(Model, field, { ...options, ifNotExists: true });
      fieldParts = fieldParts.concat(result);
    });

    return Nife.uniq(fieldParts);
  }

  generateColumnDeclarationStatement(Model, field, _options) {
    let options         = _options || {};
    let constraintParts = [];
    let defaultValue    = this.getFieldDefaultValue(field, field.fieldName, { remoteOnly: true });

    if (field.primaryKey) {
      if (LiteralBase.isLiteral(field.primaryKey))
        constraintParts.push(field.primaryKey.toString(this.connection));
      else
        constraintParts.push('PRIMARY KEY');

      if (defaultValue !== 'AUTOINCREMENT')
        constraintParts.push('NOT NULL');
    } else {
      if (field.unique) {
        if (LiteralBase.isLiteral(field.unique))
          constraintParts.push(field.unique.toString(this.connection));
        else
          constraintParts.push('UNIQUE');
      }

      if (field.allowNull === false)
        constraintParts.push('NOT NULL');
    }

    if (defaultValue != null && defaultValue !== '' && !(defaultValue === 'AUTOINCREMENT' && options.noAutoIncrementDefault === true))
      constraintParts.push(defaultValue);

    constraintParts = constraintParts.join(' ');
    if (Nife.isNotEmpty(constraintParts))
      constraintParts = ` ${constraintParts}`;

    return `${this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true })} ${field.type.toConnectionType(this.connection, { ...options, createTable: true, defaultValue })}${constraintParts}`;
  }

  generateCreateTableStatement(Model, _options) {
    let options = _options || {};
    let fieldParts = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      fieldParts.push(`  ${this.generateColumnDeclarationStatement(Model, field, options)}`);
    });

    let ifNotExists = '';
    if (options.ifNotExists === true)
      ifNotExists = 'IF NOT EXISTS ';

    let trailingParts = Nife.toArray(this.generateCreateTableStatementInnerTail(Model, options)).filter(Boolean);
    if (Nife.isNotEmpty(trailingParts))
      fieldParts = fieldParts.concat(trailingParts.map((part) => `  ${part.trim()}`));

    let finalStatement = `CREATE TABLE ${ifNotExists}${this.getEscapedTableName(Model)} (\n${fieldParts.join(',\n')}\n)`;
    return finalStatement;
  }

  generateInsertFieldValuesFromModel(model, _options) {
    if (!model)
      return;

    let options       = _options || {};
    let sqlParts      = [];
    let modelChanges  = {};
    let dirtyFields   = model._getDirtyFields({ insert: true });

    if (dirtyFields && Object.keys(dirtyFields).length === 0)
      return;

    model.iterateFields(
      ({ field, fieldName }) => {
        if (field.type.isVirtual())
          return;

        if (!Object.prototype.hasOwnProperty.call(dirtyFields, fieldName)) {
          sqlParts.push('');
          return;
        }

        let dirtyField  = dirtyFields[fieldName];
        let fieldValue  = dirtyField.current;

        if (fieldValue === undefined)
          fieldValue = null;

        modelChanges[fieldName] = fieldValue;

        if (LiteralBase.isLiteral(fieldValue))
          fieldValue = fieldValue.toString(this.connection);
        else
          fieldValue = this.escape(field, fieldValue);

        sqlParts.push(fieldValue);
      },
      /* We need dirty fields for all models so the columns align */
      options.dirtyFields || model.getDirtyFields(options),
    );

    return { modelChanges, rowValues: sqlParts.join(',') };
  }

  generateInsertValuesFromModels(Model, _models, _options) {
    let options                 = _options || {};
    let preparedModels          = this.connection.prepareAllModelsForOperation(Model, _models, options);
    let { models, dirtyFields } = preparedModels;
    let allModelChanges         = [];

    if (Nife.isEmpty(models))
      return;

    let sqlParts    = [];
    let subOptions  = this.stackAssign(options, { dirtyFields });

    for (let i = 0, il = models.length; i < il; i++) {
      let model = models[i];
      if (!ModelBase.isModel(model))
        model = new Model(model);

      let { rowValues, modelChanges } = this.generateInsertFieldValuesFromModel(model, subOptions);
      allModelChanges.push(modelChanges);

      sqlParts.push(`(${rowValues})`);
    }

    return {
      modelChanges: allModelChanges,
      values:       (options.newlines === false) ? sqlParts.join(',') : sqlParts.join(',\n'),
    };
  }

  // eslint-disable-next-line no-unused-vars
  generateInsertStatementTail(Model, model, options, context) {
  }

  generateInsertStatement(Model, _models, _options) {
    let options                 = _options || {};
    let preparedModels          = this.connection.prepareAllModelsForOperation(Model, _models, options);
    let { models, dirtyFields } = preparedModels;
    if (Nife.isEmpty(models) || Nife.isEmpty(dirtyFields))
      return '';

    let subOptions  = this.stackAssign(options, {
      asColumn:       true,
      columnNameOnly: true,
      fields:         dirtyFields,
      dirtyFields,
    });

    let { values, modelChanges } = this.generateInsertValuesFromModels(Model, preparedModels, subOptions);
    if (!values)
      return '';

    let escapedTableName  = this.getEscapedTableName(Model, subOptions);
    let escapedFieldNames = Array.from(Object.values(this.getEscapedModelFields(Model, subOptions)));

    let insertStatementTail = this.generateInsertStatementTail(
      Model,
      models,
      subOptions,
      {
        escapedTableName,
        modelChanges,
        dirtyFields,
      },
    );

    if (insertStatementTail)
      return `INSERT INTO ${escapedTableName} (${escapedFieldNames}) VALUES ${values} ${insertStatementTail}`;

    return `INSERT INTO ${escapedTableName} (${escapedFieldNames}) VALUES ${values}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateUpdateStatementTail(Model, model, queryEngine, options, context) {
  }

  generateUpdateStatement(Model, _model, _queryEngine, _options) {
    if (!_model)
      return '';

    let queryEngine = _queryEngine;
    let options     = this.stackAssign(_options, { isUpdateOperation: true });

    if (!QueryEngine.isQuery(queryEngine)) {
      queryEngine = null;
      options = _queryEngine || {};
    }

    let model = _model;
    if (!ModelBase.isModel(model)) {
      let newModel = new Model();
      newModel.clearDirty();
      newModel.setAttributes(model);
      model = newModel;
    }

    let modelChanges    = model._getDirtyFields({ update: true });
    let dirtyFieldNames = Object.keys(modelChanges);
    let dirtyFields     = model.getFields(dirtyFieldNames);
    if (Nife.isEmpty(dirtyFields))
      return '';

    let escapedTableName  = this.getEscapedTableName(Model, options);
    let sqlParts          = [ 'UPDATE ', escapedTableName, ' SET ' ];
    let setParts          = [];
    let tabs              = '';

    if (options.newlines !== false) {
      sqlParts.push('\n');
      tabs = '  ';
    }

    for (let i = 0, il = dirtyFields.length; i < il; i++) {
      let dirtyField        = dirtyFields[i];
      let fieldValue        = modelChanges[dirtyField.fieldName].current;
      let escapedColumnName = this.getEscapedColumnName(dirtyField.Model, dirtyField.columnName, { columnNameOnly: true });
      let escapedValue      = (LiteralBase.isLiteral(fieldValue)) ? fieldValue.toString(this.connection) : this.escape(dirtyField, fieldValue);
      if (!escapedValue)
        continue;

      setParts.push(`${tabs}${escapedColumnName} = ${escapedValue}`);
    }

    if (setParts.length === 0)
      return '';

    sqlParts.push((options.newlines === false) ? setParts.join(',') : setParts.join(',\n'));

    let where;
    if (queryEngine) {
      where = this.generateWhereAndOrderLimitOffset(queryEngine, this.stackAssign(options, { orderClauseOnlyIfLimited: true }));
      if (where) {
        if (options.newlines !== false)
          sqlParts.push('\n');
        else
          sqlParts.push(' ');

        sqlParts.push(where);
      }
    }

    let updateStatementTail = this.generateUpdateStatementTail(
      Model,
      model,
      options,
      {
        queryEngine,
        escapedTableName,
        modelChanges: [ modelChanges ],
        dirtyFields,
        where,
      },
    );

    if (updateStatementTail)
      sqlParts.push(` ${updateStatementTail}`);

    return sqlParts.join('');
  }

  generateDeleteStatementReturningClause(Model, queryEngine, pkField, escapedColumnName, options) {
    if (!escapedColumnName)
      return '';

    return `RETURNING ${escapedColumnName}`;
  }

  generateDeleteStatement(Model, _queryEngine, _options) {
    let queryEngine = _queryEngine;
    let options     = _options;

    if (queryEngine) {
      if (!QueryEngine.isQuery(queryEngine)) {
        let models = Nife.toArray(queryEngine);
        queryEngine = Utils.buildQueryFromModelsAttributes(Model, models);
        if (!queryEngine)
          throw new Error(`${this.constructor.name}::generateDeleteStatement: Data provided for "${Model.getModelName()}" model is insufficient to complete operation.`);
      } else {
        queryEngine = queryEngine.clone();
      }
    }

    let escapedTableName  = this.getEscapedTableName(Model, options);
    let pkField           = Model.getPrimaryKeyField();

    if (queryEngine && queryEngine.queryHasConditions()) {
      if (queryEngine.queryHasJoins()) {
        if (!pkField)
          throw new Error(`${this.constructor.name}::generateDeleteStatement: Can not delete using table joins on a table with no primary key field.`);

        let escapedTableNameAlias = this.getEscapedTableName(Model, { tableNamePrefix: '_' });
        let escapedFieldAlias     = this.getEscapedColumnName(Model, pkField, { columnNameOnly: true });
        let innerSelect = this.generateSelectStatement(
          queryEngine
            .AND[Model.getModelName(this.connection)][pkField.fieldName]
              .EQ(new Literals.Literal(`${escapedTableNameAlias}.${escapedFieldAlias}`))
            .PROJECT(new Literals.Literal('1'))
            .LIMIT(1)
            .OFFSET(0),
          this.stackAssign(
            options,
            {
              isSubQuery:          true,
              subQueryOperator:    'EXISTS',
              noProjectionAliases: true,
              forceLimit:          4294967295,
            },
          ),
        );

        let returningField  = `${escapedTableNameAlias}.${this.getEscapedColumnName(pkField.Model, pkField, this.stackAssign(options, { columnNameOnly: true }))}`;
        let returningClause = this.generateDeleteStatementReturningClause(Model, queryEngine, pkField, returningField, options);

        return `DELETE FROM ${escapedTableName} AS ${escapedTableNameAlias} WHERE EXISTS (${innerSelect})${(returningClause) ? ` ${returningClause}` : ''}`;
      } else {
        let returningField  = (pkField) ? this.getEscapedColumnName(pkField.Model, pkField, options) : '*';
        let returningClause = this.generateDeleteStatementReturningClause(Model, queryEngine, pkField, returningField, options);

        let {
          where,
          orderLimitOffset,
        } = this.generateWhereAndOrderLimitOffset(queryEngine, { ...options, forceLimit: 4294967295, separateWhereAndOrder: true });

        return `DELETE FROM ${escapedTableName}${(where) ? ` WHERE ${where}` : ''}${(returningClause) ? ` ${returningClause}` : ''}${(orderLimitOffset) ? ` ${orderLimitOffset}` : ''}`;
      }
    } else {
      return `DELETE FROM ${escapedTableName}`;
    }
  }

  _collectRemoteReturningFields(Model) {
    let remoteFieldNames = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      if (typeof field.defaultValue !== 'function')
        return;

      if (!DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'remote' ]))
        return;

      remoteFieldNames.push(this.getEscapedColumnName(field.Model, field));
    });

    return remoteFieldNames;
  }

  _collectReturningFields(Model, model, options, context) {
    let {
      modelChanges,
      dirtyFields,
    } = context;

    let returnFieldsMap = {};

    for (let i = 0, il = dirtyFields.length; i < il; i++) {
      let dirtyField = dirtyFields[i];

      for (let j = 0, jl = modelChanges.length; j < jl; j++) {
        let thisModelChanges  = modelChanges[j];
        let dirtyStatus       = thisModelChanges[dirtyField.fieldName];
        if (!dirtyStatus)
          continue;

        let fieldValue = dirtyStatus.current;
        if (!LiteralBase.isLiteral(fieldValue))
          continue;

        if (!fieldValue.options.remote)
          continue;

        let escapedColumnName = this.getEscapedColumnName(dirtyField.Model, dirtyField);
        returnFieldsMap[escapedColumnName] = true;

        break;
      }
    }

    let pkFieldName = Model.getPrimaryKeyFieldName();
    if (pkFieldName)
      returnFieldsMap[pkFieldName] = true;

    // Always return fields marked as "remote"
    let remoteFieldNames = this._collectRemoteReturningFields(Model);
    for (let i = 0, il = remoteFieldNames.length; i < il; i++) {
      let fieldName = remoteFieldNames[i];
      returnFieldsMap[fieldName] = true;
    }

    let returnFields = Object.keys(returnFieldsMap);
    if (!returnFields.length)
      return;

    return `RETURNING ${returnFields.join(',')}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateTruncateTableStatement(Model, _options) {
    let escapedTableName = this.escapeID(Model.getTableName(this.connection));
    return `TRUNCATE TABLE ${escapedTableName}`;
  }

  generateAlterTableStatement(Model, newModelAttributes, options) {
    if (Nife.isEmpty(newModelAttributes))
      return [];

    let statements = [];

    if (Nife.isNotEmpty(newModelAttributes.tableName)) {
      let currentTableName = Model.getTableName();
      if (currentTableName !== newModelAttributes.tableName)
        statements.push(`ALTER TABLE ${this.getEscapedTableName(Model, options)} RENAME TO ${this.escapeID(newModelAttributes.tableName)}`);
    }

    return statements;
  }

  generateDropColumnStatement(field, _options) {
    let Model   = field.Model;
    let options = _options || {};

    return `ALTER TABLE ${this.getEscapedTableName(Model, options)} DROP COLUMN${(options.ifExists) ? ' IF EXISTS' : ''} ${this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true })} ${(options.cascade !== false) ? 'CASCADE' : 'RESTRICT'}`;
  }

  generateAlterColumnRenameStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} RENAME COLUMN ${escapedColumnName} TO ${this.escapeID(newField.columnName)}`;
  }

  generateAlterColumnSetOrDropNullConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} ALTER COLUMN ${escapedColumnName} ${(newField.allowNull) ? 'DROP' : 'SET'} NOT NULL`;
  }

  generateAlterColumnSetDefaultStatement(field, newField, newDefaultValue, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    if (newDefaultValue === undefined)
      return `${prefix} ALTER COLUMN ${escapedColumnName} DROP DEFAULT`;
    else
      return `${prefix} ALTER COLUMN ${escapedColumnName} SET DEFAULT ${newDefaultValue}`;
  }

  generateAlterColumnChangeTypeStatement(field, newField, newFieldType, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} ALTER COLUMN ${escapedColumnName} SET DATA TYPE ${newFieldType}`;
  }

  generateAlterColumnChangePrimaryKeyConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    if (newField.primaryKey)
      return `${prefix} ALTER COLUMN ${escapedColumnName} ADD CONSTRAINT PRIMARY KEY`;
    else
      return `${prefix} ALTER COLUMN ${escapedColumnName} DROP CONSTRAINT PRIMARY KEY`;
  }

  generateAlterColumnChangeUniqueConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    if (newField.unique)
      return `${prefix} ALTER COLUMN ${escapedColumnName} ADD CONSTRAINT UNIQUE`;
    else
      return `${prefix} ALTER COLUMN ${escapedColumnName} DROP CONSTRAINT UNIQUE`;
  }

  generateAlterColumnStatements(field, _newFieldAttributes, _options) {
    if (Nife.isEmpty(_newFieldAttributes))
      return [];

    const generateIndexFieldNames = (field) => {
      let indexes = Nife.toArray(field.index).filter((index) => {
        if (index === true)
          return true;

        return (Nife.instanceOf(index, 'string', 'array') && Nife.isNotEmpty(index));
      });

      if (indexes.length === 0)
        return {};

      let indexMap = {};

      for (let i = 0, il = indexes.length; i < il; i++) {
        let indexFieldName  = indexes[i];
        let fieldNames      = [ field.fieldName ];

        if (indexFieldName !== true)
          fieldNames = fieldNames.concat(indexFieldName);

        let indexName = this.generateIndexName(Model, fieldNames, options);
        indexMap[indexName] = fieldNames;
      }

      return indexMap;
    };

    const calculateIndexDifferences = () => {
      let currentColumnIndexes  = generateIndexFieldNames(field);
      let currentIndexNames     = Object.keys(currentColumnIndexes);
      let newColumnIndexes      = generateIndexFieldNames(newField);
      let newIndexNames         = Object.keys(newColumnIndexes);

      let dropIndexes = Nife.arraySubtract(currentIndexNames, newIndexNames);
      let addIndexes  = Nife.arraySubtract(newIndexNames, currentIndexNames);

      if (addIndexes.length) {
        for (let i = 0, il = addIndexes.length; i < il; i++) {
          let indexName       = addIndexes[i];
          let indexFieldNames = newColumnIndexes[indexName];

          statements.push(this.generateCreateIndexStatement(Model, indexFieldNames, options));
        }
      }

      if (dropIndexes.length) {
        for (let i = 0, il = dropIndexes.length; i < il; i++) {
          let indexName       = dropIndexes[i];
          let indexFieldNames = currentColumnIndexes[indexName];

          statements.push(this.generateDropIndexStatement(Model, indexFieldNames, options));
        }
      }
    };

    let newField = (Field.isField(_newFieldAttributes)) ? _newFieldAttributes : new Field({ ...field, ..._newFieldAttributes });
    newField.setModel(field.Model);

    let Model       = field.Model;
    let options     = _options || {};
    let statements  = [];

    if (newField.allowNull !== field.allowNull)
      statements.push(this.generateAlterColumnSetOrDropNullConstraintStatement(field, newField, options));

    let currentDefaultValue  = this.getFieldDefaultValue(field, field.fieldName, { useDefaultKeyword: false, escape: true, remoteOnly: true });
    let newDefaultValue      = this.getFieldDefaultValue(newField, newField.fieldName, { useDefaultKeyword: false, escape: true, remoteOnly: true });

    let currentFieldType  = field.type.toConnectionType(this.connection, { createTable: true, defaultValue: currentDefaultValue });
    let newFieldType      = field.type.toConnectionType(this.connection, { createTable: true, defaultValue: newDefaultValue });
    if (newFieldType !== currentFieldType)
      statements.push(this.generateAlterColumnChangeTypeStatement(field, newField, newFieldType, _options));

    if (newDefaultValue !== currentDefaultValue)
      statements.push(this.generateAlterColumnSetDefaultStatement(field, newField, newDefaultValue, options));

    if (newField.primaryKey !== field.primaryKey)
      statements.push(this.generateAlterColumnChangePrimaryKeyConstraintStatement(field, newField, options));

    if (newField.unique !== field.unique)
      statements.push(this.generateAlterColumnChangeUniqueConstraintStatement(field, newField, options));

    if (field.index !== newField.index)
      calculateIndexDifferences();

    if (newField.columnName !== field.columnName)
      statements.push(this.generateAlterColumnRenameStatement(field, newField, options));

    return statements.filter(Boolean);
  }

  generateAddColumnStatement(field, _options) {
    let Model   = field.Model;
    let options = _options || {};
    let prefix  = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;

    return `${prefix} ADD COLUMN ${this.generateColumnDeclarationStatement(Model, field, options)}`;
  }

  toConnectionString(queryEngine, options) {
    return this.generateSelectStatement(queryEngine, options);
  }
}

module.exports = SQLQueryGeneratorBase;
