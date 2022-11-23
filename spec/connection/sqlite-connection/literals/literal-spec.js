/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, it, expect, beforeAll */

const { Literals }    = require('mythix-orm');
const Connection      = require('../../../../lib/sql-connection-base');
const { Literal } = Literals;

describe('Literal', () => {
  let connection;

  beforeAll(async () => {
    connection = new Connection({
      bindModels: false,
      models:     require('../../../support/models'),
    });
  });

  describe('toString', () => {
    it('can return anything as a literal', () => {
      expect((new Literal('test')).toString(connection)).toEqual('test');
      expect((new Literal('DERP(stuff)')).toString(connection)).toEqual('DERP(stuff)');
    });
  });
});
