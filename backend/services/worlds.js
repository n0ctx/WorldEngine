import {
  createWorld as dbCreateWorld,
  getWorldById as dbGetWorldById,
  getAllWorlds as dbGetAllWorlds,
  updateWorld as dbUpdateWorld,
  deleteWorld as dbDeleteWorld,
} from '../db/queries/worlds.js';

export function createWorld(data) {
  return dbCreateWorld(data);
}

export function getWorldById(id) {
  return dbGetWorldById(id);
}

export function getAllWorlds() {
  return dbGetAllWorlds();
}

export function updateWorld(id, patch) {
  return dbUpdateWorld(id, patch);
}

export function deleteWorld(id) {
  return dbDeleteWorld(id);
}
