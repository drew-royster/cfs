import is from 'electron-is';
import apis from './apis';
const path = require('path');
const _ = require('lodash');
const log = require('electron-log');
const filenamify = require('filenamify');

const hasItem = async (collection, item) => {
  const foundItem = _.find(collection, item);
  if (foundItem) {
    return true;
  }
  return false;
};

const getCourses = async (
  authToken,
  rootURL,
) => {
  try {
    const activeCoursesResponse = await apis.listActiveCanvasCourses(authToken, rootURL);
    const activeCourses = await Promise.all(_.map(activeCoursesResponse, async (activeCourse) => {
      try {
        const tabs = await apis.listCourseTabs(authToken, rootURL, activeCourse.id);
        const hasModulesTab = await hasItem(tabs, { id: 'modules' });
        const hasFilesTab = await hasItem(tabs, { id: 'files' });
        let files_url = null; // eslint-disable-line
        let folders_url = null; // eslint-disable-line
        if (hasFilesTab) {
          ({ files_url, folders_url } = await getCourseFilesANDFoldersURLS(authToken, rootURL, activeCourse.id)); // eslint-disable-line
        }
        return {
          id: activeCourse.id,
          hasModulesTab,
          hasFilesTab,
          sync: true,
          name: await makeFilenameSafe(activeCourse.name),
          modules: [],
          folder: true,
          files: [],
          folders: [],
          files_url,
          folders_url,
        };
      } catch (err) {
        log.error(`Error getting course: ${activeCourse.name}`);
        log.error(err);
        return {};
      }
    }));
    return { success: true, message: 'success', response: activeCourses };
  } catch (error) {
    if (
      error.message === '401 - {"errors":[{"message":"Invalid access token."}]}'
    ) {
      return { success: false, message: 'Invalid Developer Key' };
    }
    log.error(error);
    return { success: false, message: error.message };
  }
};

const buildCourseMap = async (
  authToken,
  rootURL,
  course,
) => {
  try {
    // get modules and module files if that tab is available
    if (course.hasModulesTab) {
      course.modules = await getModules(authToken, rootURL, course);
      const filesRaw = await getModulesFiles(authToken, course.modules, course);
      course.files = course.files.concat(_.flatten(filesRaw));
    }
    // get files and folders if files tab is available
    if (course.hasFilesTab) {
      const { files, folders } = await getCourseFilesAndFolders(authToken, course);
      course.files.push(...files);
      course.folders = folders;
    }
    return course;
  } catch (err) {
    log.error('Issue building course map');
    log.error(err);
    return {};
  }
};

const getModules = async (authToken, rootURL, course) => {
  try {
    const modulesRaw = await apis.listModules(authToken, rootURL, course);
    return Promise.all(_.map(modulesRaw, async (courseModule) => {
      const cleanName = await makeFilenameSafe(courseModule.name);
      return {
        name: cleanName,
        modulePath: path.join(course.name, cleanName),
        items_url: courseModule.items_url,
        items_count: courseModule.items_count,
      };
    }));
  } catch (err) {
    log.error('Issue getting modules');
    log.error(err);
    return {};
  }
};

const getModulesFiles = async (authToken, modules, course) => {
  return Promise.all(_.map(modules, async (courseModule) => {
    try {
      // get all module items
      const moduleItems = await apis.listModuleItems(authToken, courseModule);
      // filter only file items, we don't care about the rest
      const filesModules = await Promise.all(_.filter(moduleItems, moduleItem => moduleItem.type === 'File'));
      // get the file information for each module file
      const filesRaw = await Promise.all(_.map(filesModules, async (fileModule) => {
        return apis.getModuleFileDetails(authToken, fileModule.url);
      }));
      const nonLockedFilesRaw = await _.filter(filesRaw, file => !file.locked_for_user);
      // parse file information into something usable
      const files = await Promise.all(_.map(nonLockedFilesRaw, async (fileRaw) => {
        // if fileRaw is null it means we had a problem getting the module file details
        const filenameDecoded = decodeURIComponent(fileRaw.filename).replace(/\+/g, ' ').replace(/\\/g, ' ');
        const cleanName = await makeFilenameSafe(courseModule.name);
        const filename = await makeFilenameSafe(filenameDecoded);
        const filePath = path.join(course.name, cleanName, filename);
        const file = {
          name: filename,
          url: fileRaw.url,
          folder: false,
          lastUpdated: null,
          size: fileRaw.size,
          sync: true,
          id: fileRaw.id,
          filePath,
        };
        return file;
      }));
      // only return file if it's truthy. This filters out files we were unable
      return files;
    } catch (err) {
      log.error(`Issue getting modules files for ${course.name}`);
      log.error(err);
      return [];
    }
  }));
};

const getUpdatedModulesFiles = async (authToken, modules, course) => {
  const updatedModulesFiles = [];
  const courseWithModulesFiles = JSON.parse(JSON.stringify(course));

  await Promise.all(_.map(modules, async (courseModule) => {
    // get all module items
    const moduleItems = await apis.listModuleItems(authToken, courseModule);
    // filter only file items, we don't care about the rest
    const filesModules = await Promise.all(_.filter(moduleItems, moduleItem => moduleItem.type === 'File'));
    // get the file information for each module file
    const filesRaw = await Promise.all(_.map(filesModules, async (fileModule) => {
      return apis.getModuleFileDetails(authToken, fileModule.url);
    }));
    // parse file information into something usable
    await Promise.all(_.map(filesRaw, async (fileRaw) => {
      const filenameDecoded = decodeURIComponent(fileRaw.filename).replace(/\+/g, ' ').replace(/\\/g, ' ');
      const cleanName = await makeFilenameSafe(courseModule.name);
      const filename = await makeFilenameSafe(filenameDecoded);
      const filePath = await path.join(course.name, cleanName, filename);
      const file = {
        name: filename,
        url: fileRaw.url,
        folder: false,
        lastUpdated: null,
        size: fileRaw.size,
        sync: true,
        id: fileRaw.id,
        filePath,
        courseID: courseWithModulesFiles.id,
      };
      updatedModulesFiles.push(file);
      const fileIndex = _.findIndex(courseWithModulesFiles.files,
        { filePath });
      if (fileIndex >= 0) {
        // log.info('updating file');
        courseWithModulesFiles.files[fileIndex] = file;
      } else {
        courseWithModulesFiles.files.push(file);
      }
    }));
  }));
  return { updatedModulesFiles, courseWithModulesFiles };
};

// Right now this will only get 100 folders may want to add recursion into this as well
const getFolders = async (authToken, folderURL, currentPath) => {
  const foldersResponse = await apis.list200Items(authToken, folderURL);
  return Promise.all(_.map(foldersResponse, async (folder) => {
    const folderPath = path.join(currentPath, await makeFilenameSafe(folder.name));
    return {
      name: await makeFilenameSafe(folder.name),
      lastUpdated: folder.updated_at,
      folder: true,
      folders_count: folder.folders_count,
      folders_url: folder.folders_url,
      files_count: folder.files_count,
      files_url: folder.files_url,
      sync: true,
      id: folder.id,
      folderPath,
    };
  }));
};

// Right now this will only get 200 files may want to add recursion into this as well
const getFiles = async (authToken, filesURL, currentPath) => {
  const filesResponse = await apis.list200Items(authToken, filesURL);
  return Promise.all(_.map(filesResponse, async (fileRaw) => {
    const filePath = path.join(currentPath, fileRaw.display_name);
    return {
      name: fileRaw.display_name,
      url: fileRaw.url,
      folder: false,
      lastUpdated: null,
      size: fileRaw.size,
      sync: true,
      id: fileRaw.id,
      filePath,
    };
  }));
};

// Right now this will only get 200 files may want to add recursion into this as well
const getNewOrUpdatedFiles = async (authToken, filesURL, currentPath, lastSynced) => {
  try {
    const filesResponse = await apis.list200FilesByUpdatedAt(authToken, filesURL);
    // filter files updated more recently than lastSynced
    const newFiles = _.filter(filesResponse, (file) => {
      if (new Date(file.updated_at) > new Date(lastSynced)) {
        return file;
      }
      return false;
    });
    return Promise.all(_.map(newFiles, async (newFile) => {
      const filePath = path.join(currentPath, newFile.display_name);
      return {
        name: newFile.display_name,
        url: newFile.url,
        folder: false,
        lastUpdated: null,
        size: newFile.size,
        sync: true,
        id: newFile.id,
        filePath,
      };
    }));
  } catch (err) {
    log.error(err);
    log.error('Problem getting new or updated files');
    return [];
  }
};

const findAllFolders = async (authToken, course) => {
  try {
    const findFolders = (authToken, folder, currentPath, files = []) => {
      return getFolders(authToken, folder.folders_url, currentPath)
        .then((items) => {
          return Promise.all(_.map(items, async (item) => {
            files.push(item);
            if (item.folders_count > 0) {
              return findFolders(authToken, item, item.folderPath, files);
            }
            return false;
          }));
        })
        .then(() => {
          return files;
        });
    };
    return findFolders(authToken, course, course.name);
  } catch (error) {
    log.error(error);
  }
  return false;
};

const findAllFiles = async (authToken, folders) => {
  try {
    let files = [];
    await Promise.all(_.map(folders, async (folder) => {
      if (folder.files_count > 0) {
        const folderFiles = await getFiles(authToken, folder.files_url, folder.folderPath);
        files = files.concat(folderFiles);
      }
    }));
    return files;
  } catch (error) {
    log.error(error);
  }
  return false;
};

const getAllNewOrUpdatedFiles = async (authToken, course, lastSynced) => {
  try {
    let files = [];
    const rootFolderFiles = await getNewOrUpdatedFiles(authToken,
      course.files_url, course.name, lastSynced);
    files = files.concat(rootFolderFiles);
    await Promise.all(_.map(course.folders, async (folder) => {
      const folderFiles = await getNewOrUpdatedFiles(authToken,
        folder.files_url, folder.folderPath, lastSynced);
      files = files.concat(folderFiles);
    }));
    return files;
  } catch (error) {
    log.error('problem getting new files');
  }
  return false;
};

const getCourseFilesANDFoldersURLS = async (authToken, rootURL, courseID) => {
  try {
    const rootFolderResponse = await apis.getCourseRootFolder(authToken, rootURL, courseID);
    return { files_url: rootFolderResponse.files_url, folders_url: rootFolderResponse.folders_url };
  } catch (err) {
    log.error(err);
    return { error: 'Problem getting course files folder' };
  }
};

const getCourseFilesAndFolders = async (authToken, course) => {
  const folders = await findAllFolders(authToken, course);
  let files = await findAllFiles(authToken, folders);
  const filesResponse = await getFiles(authToken, course.files_url, course.name);
  files = files.concat(filesResponse);
  return { files, folders };
};

const getNewFolders = async (authToken, rootURL, course, lastSynced) => {
  const newFolders = [];
  try {
    const folders = await apis.listFoldersByUpdatedAt(authToken, rootURL, course.id);
    const newFoldersRaw = await Promise.all(_.filter(folders, (folder) => {
      return (new Date(folder.updated_at) > new Date(lastSynced));
    }));
    const newFolders = await Promise.all(_.map(newFoldersRaw, async (folder) => {
      const parseFullName = folder.full_name.replace('course files/', '');
      // await log.info({ parseFullName });
      const cleanedPath = await makeFoldernameSafe(parseFullName);
      const folderPath = path.join(course.name, cleanedPath);
      return {
        name: await makeFilenameSafe(folder.name),
        lastUpdated: folder.updated_at,
        folder: true,
        folders_count: folder.folders_count,
        folders_url: folder.folders_url,
        files_count: folder.files_count,
        files_url: folder.files_url,
        sync: true,
        id: folder.id,
        folderPath,
      };
    }));
    return newFolders;
  } catch (err) {
    log.error(err);
    if (err.message.includes('Invalid access token.')) {
      log.error('Auth Token Expired');
    }
    return newFolders;
  }
};

const hasNewFile = async (authToken, rootURL, courseID, lastSynced) => {
  try {
    const filesLastUpdated = await apis.getLatestFile(authToken, rootURL, courseID);

    if (new Date(filesLastUpdated[0].updated_at) > new Date(lastSynced)) {
      // log.info('new file');
      return true;
    }
    return false;
  } catch (err) {
    log.error(`Error checking if ${courseID} has new files`);
    return false;
  }
};

const makeFilenameSafe = async (rawName) => {
  const trimmedName = rawName.split('|')[0].trim();
  const safeFilename = filenamify(trimmedName, { replacement: '-' });
  return safeFilename;
};

const makeFoldernameSafe = async (rawFolderName) => {
  try {
    let splitRaw;
    if (await is.osx()) {
      splitRaw = rawFolderName.split('/');
    } else {
      splitRaw = rawFolderName.split('\\');
    }
    const splitCleaned = await Promise.all(_.map(splitRaw, (name) => {
      return makeFilenameSafe(name);
    }));
    if (await is.osx()) {
      return path.join(splitCleaned.join('/'));
    }
    return path.join(splitCleaned.join('\\'));
  } catch (err) {
    log.error(err);
    return path.join(rawFolderName);
  }
};

export default {
  getCourses,
  getCourseFilesANDFoldersURLS,
  getCourseFilesAndFolders,
  getNewFolders,
  getAllNewOrUpdatedFiles,
  getModules,
  getModulesFiles,
  getUpdatedModulesFiles,
  hasNewFile,
  findAllFolders,
  findAllFiles,
  buildCourseMap,
  makeFilenameSafe,
  makeFoldernameSafe,
};
