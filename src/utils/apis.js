const log = require('electron-log');
const request = require('request-promise');

const listActiveCanvasCourses = (
  authToken,
  rootURL,
) => {
  return new Promise(async (resolve, reject) => {
    try {
      const options = {
        method: 'GET',
        uri: `${rootURL}/api/v1/users/self/courses?enrollment_state=active`,
        headers: { Authorization: `Bearer ${authToken}` },
        json: true,
        encoding: null,
      };
      resolve(request(options));
    } catch (err) {
      log.error(err);
      reject(err);
    }
  });
};

const listModules = async (authToken, rootURL, course) => {
  const options = {
    method: 'GET',
    uri: `${rootURL}/api/v1/courses/${course.id}/modules?per_page=100`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

const listModuleItems = async (authToken, courseModule) => {
  const options = {
    method: 'GET',
    uri: courseModule.items_url,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

const list200Items = async (authToken, itemsURL) => {
  const options = {
    method: 'GET',
    uri: `${itemsURL}/?per_page=200`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request(options);
};

const getModuleFileDetails = async (authToken, fileModuleURL) => {
  try {
    const options = {
      method: 'GET',
      uri: fileModuleURL,
      headers: { Authorization: `Bearer ${authToken}` },
      json: true,
      encoding: null,
    };
    return request.get(options);
  } catch (err) {
    log.error(`Issue getting file module details for ${fileModuleURL}`);
    log.error(err);
    return null;
  }
};

const getCourseRootFolder = async (authToken, rootURL, courseID) => {
  const options = {
    method: 'GET',
    uri: `${rootURL}/api/v1/courses/${courseID}/folders/root`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

const listFoldersByUpdatedAt = async (authToken, rootURL, courseID) => {
  const options = {
    method: 'GET',
    uri: `${rootURL}/api/v1/courses/${courseID}/folders?sort=updated_at&order=desc&per_page=200`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

const list200FilesByUpdatedAt = async (authToken, filesURL) => {
  const options = {
    method: 'GET',
    uri: `${filesURL}/?per_page=200&sort=updated_at&order=desc`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

const getLatestFile = async (authToken, rootURL, courseID) => {
  const options = {
    method: 'GET',
    uri: `${rootURL}/api/v1/courses/${courseID}/files?per_page=1&sort=updated_at&order=desc`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

const listCourseTabs = async (authToken, rootURL, courseID) => {
  const options = {
    method: 'GET',
    uri: `${rootURL}/api/v1/courses/${courseID}/tabs`,
    headers: { Authorization: `Bearer ${authToken}` },
    json: true,
    encoding: null,
  };
  return request.get(options);
};

export default {
  getLatestFile,
  getCourseRootFolder,
  getModuleFileDetails,
  listModules,
  list200Items,
  listCourseTabs,
  listModuleItems,
  listFoldersByUpdatedAt,
  listActiveCanvasCourses,
  list200FilesByUpdatedAt,
};
