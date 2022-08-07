'use strict';

const SQLQueryGeneratorBase = require('../../../lib/sql-query-generator-base');

class SQLiteQueryGenerator extends SQLQueryGeneratorBase {
  // eslint-disable-next-line no-unused-vars
  generateSQLJoinTypeFromQueryEngineJoinType(joinType, outer, options) {
    if (!joinType || joinType === 'inner')
      return 'INNER JOIN';
    else if (joinType === 'left')
      return 'LEFT JOIN';
    else if (joinType === 'cross')
      return 'CROSS JOIN';

    return joinType;
  }

  generateForeignKeyConstraint(field, type) {
    let options     = type.getOptions();
    let targetModel = type.getTargetModel(this.connection);
    let targetField = type.getTargetField(this.connection);

    let sqlParts = [
      'FOREIGN KEY(',
      this.escapeID(field.columnName),
      ') REFERENCES ',
      this.escapeID(targetModel.getTableName(this.connection)),
      '(',
      this.escapeID(targetField.columnName),
      ')',
    ];

    if (options.deferred === true) {
      sqlParts.push(' ');
      sqlParts.push('DEFERRABLE INITIALLY DEFERRED');
    }

    if (options.onDelete) {
      sqlParts.push(' ');
      sqlParts.push(`ON DELETE ${options.onDelete.toUpperCase()}`);
    }

    if (options.onUpdate) {
      sqlParts.push(' ');
      sqlParts.push(`ON UPDATE ${options.onUpdate.toUpperCase()}`);
    }

    return sqlParts.join('');
  }

  generateInsertStatementTail(Model, model, options, context) {
    return this._collectReturningFields(Model, model, options, context);
  }

  generateUpdateStatementTail(Model, model, options, context) {
    return this._collectReturningFields(Model, model, options, context);
  }
}

module.exports = SQLiteQueryGenerator;
