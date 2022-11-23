/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, it, expect, beforeAll */

const { Literals }    = require('mythix-orm');
const Connection      = require('../../../../lib/sql-connection-base');
const { FieldLiteral, Literal } = Literals;

describe('FieldLiteral', () => {
  let connection;
  let User;

  beforeAll(async () => {
    connection = new Connection({
      bindModels: false,
      models:     require('../../../support/models'),
    });

    let models = connection.getModels();

    User = models.User;
  });

  describe('toString', () => {
    it('can turn a fully qualified name into a projection field', () => {
      expect((new FieldLiteral('User:id')).toString(connection)).toEqual('"users"."id" AS "User:id"');
    });

    it('will throw an exception if no field is present', () => {
      expect(() => (new FieldLiteral()).toString(connection)).toThrow(new TypeError('FieldLiteral::fullyQualifiedNameToDefinition: Unable to find field for fully qualified name "undefined".'));
    });

    it('can turn a raw field into a projection field', () => {
      expect((new FieldLiteral(User.fields.firstName)).toString(connection)).toEqual('"users"."firstName" AS "User:firstName"');
    });

    it('can provide a SQL literal', () => {
      expect((new FieldLiteral(new Literal('test'))).toString(connection)).toEqual('test');
    });
  });
});
