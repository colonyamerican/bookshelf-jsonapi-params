import _ from 'lodash';
import Bookshelf from 'bookshelf';
import JsonApiParams from '../src/index';
import Knex from 'knex';
import Sqlite3 from 'sqlite3';
import Promise from 'bluebird';

// Use Chai.expect
import Chai from 'chai';
const expect = Chai.expect;
Chai.use(expect);

describe('bookshelf-jsonapi-params', () => {

    // Create the database
    new Sqlite3.Database('./test/test.sqlite');

    // Connect Bookshelf to the database
    const repository = Bookshelf(Knex({
        client: 'sqlite3',
        connection: {
            filename: './test/test.sqlite'
        }
    }));

    // Create models

    const ToyModel = repository.Model.extend({
        tableName: 'toy',
        pet: function () {

            return this.belongsTo(PetModel);
        }
    });

    const PetModel = repository.Model.extend({
        tableName: 'pet',
        petOwner: function () {

            return this.belongsTo(PersonModel, 'pet_owner_id');
        },
        toy: function () {

            return this.hasOne(ToyModel);
        },
        format: function (attrs) {
            // This recreates the format behavior for those working with knex
            return _.reduce(attrs, (result, val, key) => {

                const columnComponentParts = key.split('.').map(_.snakeCase);
                result[columnComponentParts.join('.')] = val;
                return result;
            }, {});
        }
    });

    const PersonModel = repository.Model.extend({
        tableName: 'person',

        // Converts snake_case attributes to camelCase
        parse: function (attrs) {

            return _.reduce(attrs, (result, val, key) => {

                result[_.camelCase(key)] = val;
                return result;
            }, {});
        },

        // Converts camelCase attributes to snake_case.
        format: function (attrs) {

            return _.reduce(attrs, (result, val, key) => {

                const aggregateFunctions = ['count', 'sum', 'avg', 'max', 'min'];

                if (_.some(aggregateFunctions, (f) => _.startsWith(key, f + '('))) {
                    result[key] = val;
                }
                else {
                    result[_.snakeCase(key)] = val;
                }

                return result;
            }, {});
        },

        pets: function () {

            return this.hasOne(PetModel, 'pet_owner_id');
        }
    });


    before(() => {

        // Register the plugin with Bookshelf
        repository.plugin(JsonApiParams);

        // Build the schema and add some data
        return Promise.join(
            repository.knex.schema.dropTableIfExists('person'),
            repository.knex.schema.dropTableIfExists('pet'),
            repository.knex.schema.dropTableIfExists('toy')
        )
            .then(() => {

                return Promise.join(
                    repository.knex.schema.createTable('person', (table) => {

                        table.increments('id').primary();
                        table.string('first_name');
                        table.integer('age');
                        table.string('gender');
                        table.string('type');
                    }),
                    repository.knex.schema.createTable('pet', (table) => {

                        table.increments('id').primary();
                        table.string('name');
                        table.integer('pet_owner_id');
                    }),
                    repository.knex.schema.createTable('toy', (table) => {

                        table.increments('id').primary();
                        table.string('type');
                        table.integer('pet_id');
                    })
                );
            })
            .then(() => {

                return Promise.join(
                    PersonModel.forge().save({
                        id: 1,
                        firstName: 'Barney',
                        age: 12,
                        gender: 'm',
                        type: 't-rex'
                    }),
                    PersonModel.forge().save({
                        id: 2,
                        firstName: 'Baby Bop',
                        age: 25,
                        gender: 'f',
                        type: 'triceratops'

                    }),
                    PersonModel.forge().save({
                        id: 3,
                        firstName: 'Cookie Monster',
                        age: 70,
                        gender: 'm',
                        type: 'monster'
                    }),
                    PersonModel.forge().save({
                        id: 4,
                        firstName: 'Boo',
                        age: 28,
                        gender: 'f',
                        type: 'nothing, here'
                    }),
                    PersonModel.forge().save({
                        id: 5,
                        firstName: 'Elmo',
                        age: 3,
                        gender: 'm',
                        type: null
                    }),
                    PetModel.forge().save({
                        id: 1,
                        name: 'Big Bird',
                        pet_owner_id: 1
                    }),
                    PetModel.forge().save({
                        id: 2,
                        name: 'Godzilla',
                        pet_owner_id: 2
                    }),
                    PetModel.forge().save({
                        id: 3,
                        name: 'Patches',
                        pet_owner_id: 3
                    }),
                    PetModel.forge().save({
                        id: 4,
                        name: 'Grover',
                        pet_owner_id: 1
                    }),
                    PetModel.forge().save({
                        id: 5,
                        name: 'Benny "The Terror" Terrier',
                        pet_owner_id: 2
                    }),
                    ToyModel.forge().save({
                        id: 1,
                        type: 'skate',
                        pet_id: 1
                    }),
                    ToyModel.forge().save({
                        id: 2,
                        type: 'car',
                        pet_id: 2
                    })
                );
            });
    });

    after(() => {
        // Drop the tables when tests are complete
        Promise.join(
            repository.knex.schema.dropTableIfExists('person'),
            repository.knex.schema.dropTableIfExists('pet'),
            repository.knex.schema.dropTableIfExists('toy')
        );
    });

    describe('passing no parameters', () => {
        it('should return a single record', () => {
            return PersonModel
                .where({ id: 1 })
                .fetchJsonApi(null, false)
                .then((person) => {
                    expect(person.get('firstName')).to.equal('Barney');
                    expect(person.get('gender')).to.equal('m');
                });
        });

        it('should return multiple records', () => {
            return PersonModel
                .forge()
                .fetchJsonApi()
                .then((result) => {
                    expect(result.models).to.have.length(5);
                });
        });
    });

    describe('passing a `fields` parameter', () => {

        it('should only return the specified field for the record', () => {
            return PersonModel
                .where({ id: 2 })
                .fetchJsonApi({
                    fields: {
                        person: ['firstName']
                    }
                }, false)
                .then((person) => {
                    expect(person.get('firstName')).to.equal('Baby Bop');
                    expect(person.get('gender')).to.be.undefined;
                });
        });
    });

    describe('passing a `filters` parameter with a single filter', () => {
        it('should return a single record with the matching id', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        id: 1
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                });
        });

        it('should return a single record with the matching type as null', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        type: null
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('firstName')).to.equal('Elmo');
                });
        });
    });

    describe('passing a `filters` parameter with multiple filters', () => {
        it('should return a single record that matches both filters', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        type: 't-rex,triceratops'
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                });
        });

        it('should return a single record that matches both filters with a null', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        type: 'null,t-rex'
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                });
        });
    });

    describe('passing a `filter[like]` parameter with a single filter', () => {
        it('should return all records that partially matches filter[like]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        like: {
                            first_name: 'Ba'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                    expect(result.models[0].get('firstName')).to.equal('Barney');
                    expect(result.models[1].get('firstName')).to.equal('Baby Bop');
                });
        });
    });

    describe('passing a `filter[like]` parameter with multiple filters', () => {
        it('should return all records that partially matches both filter[like]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        like: {
                            first_name: 'op,coo'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                    expect(result.models[0].get('firstName')).to.equal('Baby Bop');
                    expect(result.models[1].get('firstName')).to.equal('Cookie Monster');
                });
        });
    });

    describe('passing a `filter[not]` parameter with a single filter', () => {
        it('should return all records that do not match filter[not]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        not: {
                            first_name: 'Barney'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(4);
                    expect(result.models[0].get('firstName')).to.equal('Baby Bop');
                    expect(result.models[1].get('firstName')).to.equal('Cookie Monster');
                    expect(result.models[2].get('firstName')).to.equal('Boo');
                    expect(result.models[3].get('firstName')).to.equal('Elmo');
                });
        });

        it('should return all records that do not match filter[not] with null', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        not: {
                            type: null
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(4);
                    expect(result.models[0].get('type')).to.equal('t-rex');
                    expect(result.models[1].get('type')).to.equal('triceratops');
                    expect(result.models[2].get('type')).to.equal('monster');
                    expect(result.models[3].get('type')).to.equal('nothing, here');
                });
        });

        it('should return all records that do not match filter[not] with null as a string', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        not: {
                            type: 'null'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(4);
                    expect(result.models[0].get('type')).to.equal('t-rex');
                    expect(result.models[1].get('type')).to.equal('triceratops');
                    expect(result.models[2].get('type')).to.equal('monster');
                    expect(result.models[3].get('type')).to.equal('nothing, here');
                });
        });
    });

    describe('passing a `filter[not]` parameter with multiple filters', () => {

        it('should return all records that do not match filter[not]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        not: {
                            first_name: 'Barney,Baby Bop,Boo,Elmo'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('firstName')).to.equal('Cookie Monster');
                });
        });

        it('should return all records that do not match filter[not] including null', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        not: {
                            type: 'null,t-rex'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(3);
                    expect(result.models[0].get('type')).to.equal('triceratops');
                    expect(result.models[1].get('type')).to.equal('monster');
                    expect(result.models[2].get('type')).to.equal('nothing, here');
                });
        });
    });

    describe('passing a `filter[lt]` parameter', () => {
        it('should return all records that are less than filter[lt]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        lt: {
                            age: 25
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                    expect(result.models[0].get('firstName')).to.equal('Barney');
                    expect(result.models[1].get('firstName')).to.equal('Elmo');
                });
        });
    });

    describe('passing a `filter[lte]` parameter', () => {
        it('should return all records that are less than or equal to filter[lte]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        lte: {
                            age: 25
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(3);
                    expect(result.models[0].get('firstName')).to.equal('Barney');
                    expect(result.models[1].get('firstName')).to.equal('Baby Bop');
                    expect(result.models[2].get('firstName')).to.equal('Elmo');
                });
        });
    });

    describe('passing a `filter[gt]` parameter', () => {
        it('should return all records that are greater than filter[gt]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        gt: {
                            age: 25
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                    expect(result.models[0].get('firstName')).to.equal('Cookie Monster');
                    expect(result.models[1].get('firstName')).to.equal('Boo');
                });
        });
    });

    describe('passing a `filter[gte]` parameter', () => {
        it('should return all records that are greater than or equal to filter[gte]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        gte: {
                            age: 25
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(3);
                    expect(result.models[0].get('firstName')).to.equal('Baby Bop');
                    expect(result.models[1].get('firstName')).to.equal('Cookie Monster');
                    expect(result.models[2].get('firstName')).to.equal('Boo');
                });
        });
    });

    describe('passing a `filter[gte]` and `filter[like]` parameter', () => {
        it('should return all records that are greater than or equal to filter[gte] and a partial match to filter[like]', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        gte: {
                            age: 25
                        },
                        like: {
                            first_name: 'a'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('firstName')).to.equal('Baby Bop');
                });
        });
    });


    describe('passing a `filter` parameter for relationships', () => {
        it('should return all records that have a pet with name', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        'pets.name': 'Big Bird'
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('firstName')).to.equal('Barney');
                });
        });

        it('should return the person named Cookie Monster', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        firstName: 'Cookie Monster',
                        gender: 'm'
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('firstName')).to.equal('Cookie Monster');
                });
        });
    });

    describe('passing a `sort` parameter', () => {
        it('should return records sorted by type ascending (single word param name)', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    sort: ['type']
                })
                .then((result) => {
                    expect(result.models).to.have.length(5);
                    expect(result.models[0].get('type')).to.equal(null);
                    expect(result.models[1].get('type')).to.equal('monster');
                });
        });

        it('should return records sorted by type descending (single word param name)', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    sort: ['-type']
                })
                .then((result) => {
                    expect(result.models).to.have.length(5);
                    expect(result.models[0].get('type')).to.equal('triceratops');
                });
        });

        it('should return records sorted by name ascending (multi-word param name)', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    sort: ['firstName']
                })
                .then((result) => {
                    expect(result.models).to.have.length(5);
                    expect(result.models[0].get('firstName')).to.equal('Baby Bop');
                });
        });

        it('should return records sorted by name descending (multi-word param name)', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    sort: ['-firstName']
                })
                .then((result) => {
                    expect(result.models).to.have.length(5);
                    expect(result.models[0].get('firstName')).to.equal('Elmo');
                });
        });

        it('should sort on deeply nested resources', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    include: ['pets', 'pets.toy'],
                    sort: ['-pets.toy.type']
                })
                .then((result) => {
                    expect(result.models[0].related('pets').related('toy').get('type')).to.equal('skate');
                    expect(result.models[1].related('pets').related('toy').get('type')).to.equal('car');
                });
        });
    });

    describe('passing an `include` parameter', () => {
        it('should include the pets relationship', () => {
            return PersonModel
                .where({ id: 1 })
                .fetchJsonApi({
                    include: ['pets']
                }, false)
                .then((result) => {
                    const relation = result.related('pets');

                    expect(result).to.be.an('object');
                    expect(relation).to.exist;
                    expect(relation.get('name')).to.equal('Big Bird');
                });
        });

        it('should include the pets relationship when `include` is a Knex function', () => {
            return PersonModel
                .where({ id: 1 })
                .fetchJsonApi({
                    include: [{
                        'pets': (qb) => {

                            qb.where({ name: 'Barney' });
                        }
                    }]
                }, false)
                .then((result) => {
                    const relation = result.related('pets');
                    expect(result).to.be.an('object');
                    expect(relation.id).to.not.exist;
                });
        });
    });

    describe('escape commas in filter', () => {
        it('should escape the comma and find a result', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        type: 'nothing\\, here'
                    }
                }, false)
                .then((result) => {
                    expect(result).to.be.an('object');
                    expect(result.get('firstName')).to.equal('Boo');
                });
        });

        it('should find no results if comma is not escaped', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        type: 'nothing, here'
                    }
                }, false)
                .then((result) => {
                    expect(result).to.equal(null);
                });
        });
    });

    describe('like filtering on non-text fields', () => {
        it('should return the should return all record that have an age that contains the digit "2"', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        like: {
                            age: '2'
                        }
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(3);
                    expect(result.models[0].get('firstName')).to.equal('Barney');
                    expect(result.models[1].get('firstName')).to.equal('Baby Bop');
                    expect(result.models[2].get('firstName')).to.equal('Boo');
                });
        });
    });

    describe('passing a `fields` parameter with an aggregate function', () => {
        it('should return the total count of records', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    fields: {
                        person: ['count(id)']
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('count')).to.equal(5);
                });
        });

        it('should return the average age per gender', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    fields: {
                        person: ['avg(age)','gender']
                    },
                    group: ['gender']
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                    expect(result.models[0].get('gender')).to.equal('f');
                    expect(result.models[0].get('avg')).to.equal((25 + 28) / 2);
                    expect(result.models[1].get('gender')).to.equal('m');
                    expect(result.models[1].get('avg')).to.equal((12 + 70 + 3) / 3);
                });
        });

        it('should return the sum of the ages of persons with firstName containing \'Ba\'', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        like: {
                            first_name: 'Ba'
                        }
                    },
                    fields: {
                        person: ['sum(age)']
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('sum')).to.equal(37);
                });
        });
    });

    describe('passing in an additional query', () => {
        it('should return the total count of records', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({}, undefined, undefined, (qb) => {
                    qb.count('id');
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('countId')).to.equal(5);
                });
        });

        it('should return the average age per gender', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({}, undefined, undefined, (qb) => {
                    qb.groupBy('gender').select('gender').avg('age');
                })
                .then((result) => {
                    expect(result.models).to.have.length(2);
                    expect(result.models[0].get('gender')).to.equal('f');
                    expect(result.models[0].get('avgAge')).to.equal((25 + 28) / 2);
                    expect(result.models[1].get('gender')).to.equal('m');
                    expect(result.models[1].get('avgAge')).to.equal((12 + 70 + 3) / 3);
                });
        });

        it('should return the sum of the ages of persons with firstName containing \'Ba\'', () => {
            return PersonModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        like: {
                            first_name: 'Ba'
                        }
                    }
                }, undefined, undefined, (qb) => {
                    qb.sum('age');
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('sumAge')).to.equal(37);
                });
        });
    });

    describe('Filtering by string values which contain quotes', () => {
        it('should maintain quotes when it builds the filter', () => {
            return PetModel
                .forge()
                .fetchJsonApi({
                    filter: {
                        name: 'Benny "The Terror" Terrier'
                    }
                })
                .then((result) => {
                    expect(result.models).to.have.length(1);
                });
        });
    });



    describe('Sorting by multiple columns with a mix of camelCase values', () => {
        it('should generate valid SQL', () => {
            return PetModel
                .forge()
                .fetchJsonApi({
                    sort: ['-petOwner.age', 'name']
                })
                .then((result) => {
                    expect(result.models).to.have.length(5);
                    expect(result.models[3].get('name')).to.equal('Big Bird');
                    expect(result.models[4].get('name')).to.equal('Grover');
                });
        });
    });


    describe('passing default paging parameters to the plugin', () => {
        before(() => {
            repository.plugin(JsonApiParams, {
                pagination: { limit: 1, offset: 0 }
            });
        });

        it('should properly paginate records', () => {
            return PersonModel
                .forge()
                .fetchJsonApi()
                .then((result) => {
                    expect(result.models).to.have.length(1);
                    expect(result.models[0].get('id')).to.equal(1);
                    expect(result.pagination.pageCount).to.equal(5);
                });
        });
    });
});
