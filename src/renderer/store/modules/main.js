import { ipcRenderer } from 'electron'; // eslint-disable-line
import log from 'electron-log';
import router from '../../router/index';
const canvasIntegrationFile = require('../../../utils/canvasIntegration');
const appVersion = require('../../../../package').version;
const dataStorageFile = require('../../../utils/dataStorage');
const canvasIntegration = canvasIntegrationFile.default;
const dataStorage = dataStorageFile.default;
const _ = require('lodash');
const sslChecker = require('ssl-checker');

const state = {
  authToken: null,
  rootURL: null,
  rootFolder: null,
  syncFrequency: null,
  version: appVersion,
  courses: [],
  conflicts: [],
  hasNewCourses: false,
  lastSynced: null,
  error: null,
};

const mutations = {
  RESET_STATE(state) {
    state.authToken = null;
    state.rootURL = null;
    state.rootFolder = null;
    state.syncFrequency = null;
    state.version = appVersion;
    state.courses = [];
    state.conflicts = [];
    state.hasNewCourses = false;
    state.lastSynced = false;
    state.error = false;
  },
  UPDATE_SYNC_FREQUENCY(state, payload) {
    state.syncFrequency = parseInt(payload.newFrequency, 10);
  },
  SET_ERROR(state, payload) {
    state.error = payload.message;
  },
  LOAD_PROPERTY(state, payload) {
    state[payload.key] = payload.value;
  },
  SET_CONNECTION_PARAMETERS(state, payload) {
    state.authToken = payload.authToken;
    state.rootURL = payload.rootURL;
  },
  ADD_PROTOCOL(state, payload) {
    state.rootURL = `${payload}${state.rootURL}`;
  },
  SET_ROOT_FOLDER(state, payload) {
    state.rootFolder = payload;
  },
  SET_ROOT_URL(state, payload) {
    state.rootURL = payload;
  },
  SET_AUTH_TOKEN(state, payload) {
    state.authToken = payload;
  },
  SET_SYNC_FREQUENCY(state, payload) {
    state.syncFrequency = payload;
  },
  SET_HAS_NEW_COURSES(state, payload) {
    state.hasNewCourses = payload;
  },
  ADD_COURSE(state, payload) {
    const index = _.findIndex(state.courses, { id: payload.id });
    if (index >= 0) {
      state.courses[index] = payload;
    } else {
      state.courses.push(payload);
    }
  },
  SET_COURSE_MAP(state, payload) {
    const index = _.findIndex(state.courses, { id: payload.id });
    state.courses[index] = payload;
  },
  DOWNLOADED_FILE(state, payload) {
    const courseIndex = _.findIndex(state.courses, { id: payload.courseID });
    const fileIndex = _.findIndex(state.courses[courseIndex].files,
      { filePath: payload.filePath });
    state.courses[courseIndex].files[fileIndex].lastUpdated = Date.now();
  },
  SYNCED(state) {
    state.lastSynced = Date.now();
  },
  TOGGLE_SYNC_COURSE(state, payload) {
    const courseIndex = _.findIndex(state.courses, { id: payload.courseID });
    state.courses[courseIndex].sync = !state.courses[courseIndex].sync;
  },
  REMOVE_CONFLICT(state, payload) {
    _.remove(state.conflicts, (conflict) => {
      return payload.filePath === conflict.filePath;
    });
  },
};

const actions = {
  toggleSyncCourse({ commit }, payload) {
    return new Promise((resolve) => {
      commit('TOGGLE_SYNC_COURSE', payload);
      resolve();
    });
  },
  connect({ commit }) {
    return new Promise(async () => {
      try {
        log.info('attempting to connect');
        router.push('./loading');
        // checking if uses ssl or not
        const { valid } = await sslChecker(state.rootURL.split(':')[0]);
        if (valid) {
          commit('ADD_PROTOCOL', 'https://');
        } else {
          commit('ADD_PROTOCOL', 'http://');
        }
        return canvasIntegration.getCourses(
          state.authToken, state.rootURL).then((response) => {
          let coursesAdded = 0;
          if (response.success) {
            if (response.response.length === 0) {
              router.push('./configure');
            } else {
              response.response.forEach(async (course) => {
                const builtCourse = await canvasIntegration.buildCourseMap(
                  state.authToken, state.rootURL, course);
                commit('ADD_COURSE', builtCourse);
                log.info(builtCourse);
                coursesAdded += 1;
                if (coursesAdded === response.response.length) {
                  log.info('going to configure');
                  router.push('./configure');
                }
              });
            }
          }
        });
      } catch (err) {
        log.error(err);
        return 'Problem getting courses';
      }
    });
  },
  downloadedFile({ commit }, payload) {
    commit('DOWNLOADED_FILE', payload);
  },
  beginInitialSync({ commit }, payload) {
    commit('SET_ROOT_FOLDER', payload.rootFolder);
    commit('SET_SYNC_FREQUENCY', payload.syncFrequency);
    router.push('./download');
  },
  loadSavedState({ commit }) {
    return new Promise(async (resolve) => {
      const savedState = await dataStorage.getSavedState();
      Object.entries(savedState).forEach(([key, value]) => {
        commit('LOAD_PROPERTY', { key, value });
      });
      resolve();
    });
  },
  saveState() {
    dataStorage.saveCurrentState(state);
  },
  removeConflict({ commit }, payload) {
    return new Promise(async (resolve) => {
      commit('REMOVE_CONFLICT', payload);
      resolve();
    });
  },
  completedInitialSync({ commit }, payload) {
    return new Promise(async (resolve, reject) => {
      commit('SYNCED');
      const savedSuccessfully = dataStorage.saveCurrentState(state);
      if (savedSuccessfully) {
        router.push(`./report/${payload.successes}/${payload.failures}`);
        ipcRenderer.send('syncing-done');
        resolve(savedSuccessfully);
      } else {
        ipcRenderer.send('syncing-done');
        reject('Error saving currest state');
      }
    });
  },
  goUniversityLogin({ commit }, payload) {
    commit('SET_ROOT_URL', payload.rootURL);
    router.push(`./login/${payload.rootURL}`);
  },
  isConnected() {
    return new Promise(async (resolve) => {
      if (await dataStorage.isConnected()) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  },
  hasNewCourses() {
    return new Promise(async (resolve) => {
      if (await dataStorage.getHasNewCourses()) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  },
  setHasNewCourses({ commit }, status) {
    commit('SET_HAS_NEW_COURSES', status);
  },
  clearStateGoLogin({ commit }) {
    commit('RESET_STATE');
    router.push('/home');
  },
  goErrorPage({ commit }, payload) {
    commit('SET_ERROR', payload);
    router.push('/error');
  },
  updateSyncFrequency({ commit }, payload) {
    return new Promise((resolve, reject) => {
      commit('UPDATE_SYNC_FREQUENCY', payload);
      dataStorage.updateSyncFrequency(payload)
        .then(() => {
          resolve('Updated Sync Frequency Successfully');
        })
        .catch(() => {
          reject('Problem updating Sync Frequency');
        });
    });
  },
};

const getters = {
  authToken(state) {
    return state.authToken;
  },
  rootURL(state) {
    return state.rootURL;
  },
  courses(state) {
    return state.courses;
  },
  syncableCourses(state) {
    return Promise.all(_.filter(state.courses, course => course.sync));
  },
  rootFolder(state) {
    return state.rootFolder;
  },
  syncFrequency(state) {
    return state.syncFrequency;
  },
  error(state) {
    return state.error;
  },
  version(state) {
    return state.version;
  },
  conflicts(state) {
    return state.conflicts;
  },
};

export default {
  state,
  mutations,
  actions,
  getters,
};
