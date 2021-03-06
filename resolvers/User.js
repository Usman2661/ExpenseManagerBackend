const bcrypt = require('bcryptjs');
const jsonwebtoken = require('jsonwebtoken');
require('dotenv').config();
var AdminSeniorManagementPermission = require('../auth/AdminSeniorManagementPermission');
var ManagerSeniorManagementPermission = require('../auth/ManagerAndSeniorManagementPermission');
var UserPermission = require('../auth/UserPermission');

const UserResolver = {
  Query: {
    async user(root, { id }, { models, user }) {
      if (!(await AdminSeniorManagementPermission(user))) {
        throw new Error('Not Authenticated');
      }
      const myuser = await models.User.findByPk(id);
      return myuser;
    },

    async allUsers(root, args, { models, user }) {
      if (!(await AdminSeniorManagementPermission(user))) {
        throw new Error('Not Authenticated');
      }

      let allUsers;
      if (user.userType === 'Admin') {
        allUsers = await models.User.findAll({
          where: {
            userType: 'SeniorManagement',
          },
          include: [
            {
              model: models.Company,
              as: 'Company',
            },
          ],
        });
      }

      if (user.userType === 'SeniorManagement') {
        allUsers = await models.User.findAll({
          where: {
            companyId: user.companyId,
          },
          include: [
            {
              model: models.Company,
              as: 'Company',
            },
          ],
        });
      }
      return allUsers;
    },

    async me(root, args, { models, user }) {
      if (!user) {
        throw new Error('Not Authenticated');
      }

      let myUser;
      myUser = await models.User.findByPk(user.id, {
        include: [
          {
            model: models.Company,
            as: 'Company',
            include: [
              {
                model: models.CompanyConfig,
              },
            ],
          },
          {
            model: models.Expense,
            include: [
              {
                model: models.ExpenseReceipt,
              },
            ],
          },
        ],
      });

      const manager = await models.User.findByPk(myUser.managerId);
      myUser['Manager'] = manager;

      return myUser;
    },

    async managerUsers(root, args, { models, user }) {
      if (!(await ManagerSeniorManagementPermission(user))) {
        throw new Error('Not Authenticated');
      }

      const managerUsers = await models.User.findAll({
        where: {
          managerId: user.id,
        },
      });
      return managerUsers;
    },
  },

  Mutation: {
    async createUser(
      root,
      {
        name,
        email,
        password,
        userType,
        jobTitle,
        department,
        companyId,
        managerId,
      },
      { models, user }
    ) {
      if (!(await AdminSeniorManagementPermission(user))) {
        throw new Error('Not Authenticated');
      }

      let createdUser;
      if (user.userType === 'SeniorManagement') {
        createdUser = await models.User.create({
          name,
          email,
          password: await bcrypt.hash(password, 10),
          userType,
          jobTitle,
          department,
          managerId,
          companyId: user.companyId,
        });
      }

      if (user.userType === 'Admin') {
        createdUser = await models.User.create({
          name,
          email,
          password: await bcrypt.hash(password, 10),
          userType,
          jobTitle,
          managerId,
          department,
          companyId,
        });
      }

      return createdUser;
    },
    async deleteUser(root, { id }, { models, user }) {
      if (!(await AdminSeniorManagementPermission(user))) {
        throw new Error('Not Authenticated');
      }
      const deletedUser = await models.User.destroy({
        where: {
          id,
        },
        returning: true,
        plain: true,
      });

      if (!deletedUser) {
        throw new Error('There was an error while deleting user');
      }

      return {
        id,
      };
    },

    async updateUser(
      root,
      { id, name, email, userType, jobTitle, department, managerId, companyId },
      { models, user }
    ) {
      if (!(await AdminSeniorManagementPermission(user)) && user.id !== id) {
        throw new Error('Not Authenticated');
      }

      const updatedUser = await models.User.update(
        {
          name,
          email,
          userType,
          jobTitle,
          department,
          managerId,
          companyId,
        },
        {
          where: {
            id,
          },
          returning: true,
          plain: true,
        }
      );

      const myUpdatedUser = updatedUser[1].dataValues;

      const compId = myUpdatedUser.companyId;

      const myCompany = await models.Company.findByPk(compId);

      myUpdatedUser.Company = myCompany.dataValues;

      if (!myUpdatedUser.id) {
        throw new Error('There was a problem updating user');
      }

      return myUpdatedUser;
    },

    async login(root, { email, password }, { models }) {
      const user = await models.User.findOne({
        where: {
          email,
        },
        include: [
          {
            model: models.Company,
            as: 'Company',
          },
        ],
      });

      if (!user) {
        throw new Error('Invalid Credentials');
      }

      const valid = await bcrypt.compare(password, user.password);

      if (!valid) {
        throw new Error('Invalid Credentials');
      }

      if (!user.userType) {
        throw new Error('Your account is pending approval');
      }
      if (!user.companyId && user.userType !== 'Admin') {
        throw new Error('Your account is pending approval');
      }

      const token = jsonwebtoken.sign(
        {
          id: user.id,
          email: user.email,
          userType: user.userType,
          managerId: user.managerId,
          companyId: user.companyId,
          Company: user.Company,
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      return {
        token,
        user,
      };
    },

    async changePassword(root, { password, newPassword }, { models, user }) {
      if (!(await UserPermission(user))) {
        throw new Error('Not Authenticated');
      }

      const myUser = await models.User.findOne({
        where: {
          email: user.email,
        },
      });

      if (!myUser) {
        throw new Error('Invalid old Password');
      }

      const valid = await bcrypt.compare(password, myUser.password);

      if (!valid) {
        throw new Error('Invalid Old Password');
      }

      const updatedUser = await models.User.update(
        {
          password: await bcrypt.hash(newPassword, 10),
        },
        {
          where: {
            id: user.id,
          },
          returning: true,
          plain: true,
        }
      );

      const myUpdatedUser = updatedUser[1].dataValues;

      return myUpdatedUser;
    },
  },
};

module.exports = UserResolver;
