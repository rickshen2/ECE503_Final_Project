const request = require('supertest');
const app = require('../server'); // Import the Express app
const mysql = require('mysql');


describe('POST /api/login', function () {
  let querySpy;

  beforeEach(() => {
    // Spy on MySQL's query method to simulate the database behavior
    querySpy = spyOn(mysql, 'createConnection').and.returnValue({
      connect: () => {},
      query: (query, params, callback) => {
        if (query.includes('SELECT * FROM users WHERE Username = ? AND Password = ?')) {
          if (params[0] === 'rds260' && params[1] === 'ECE503') {
            // Simulate a successful query return with a user
            callback(null, [{ Username: 'rds260', UserID: 1 }]);
          } else {
            // Simulate a failed query return (invalid login)
            callback(null, []);
          }
        }
      },
    });
  });

  afterEach(() => {
    querySpy.and.callThrough(); // Restore original functionality after each test
  });

  it('should login successfully with correct credentials', function (done) {
    request(app)
      .post('/api/login')
      .send({
        username: 'rds260',
        password: 'ECE503',
      })
      .expect(200)
      .end(function (err, res) {
        expect(res.body.success).toBe(true);
        expect(res.body.username).toBe('rds260');
        expect(res.body.userID).toBe(1);
        expect(res.body.simStartDay).toBeDefined();
        expect(res.body.interestRate).toBeDefined();
        done();
      });
  });

  it('should fail with invalid credentials', function (done) {
    request(app)
      .post('/api/login')
      .send({
        username: 'rds260',
        password: 'wrongpassword',
      })
      .expect(200)
      .end(function (err, res) {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Invalid username or password');
        done();
      });
  });
});
