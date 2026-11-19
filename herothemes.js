"use strict";

// HERO_BACKDROPS: hero ids with a local backdrop at assets/backdrops/<id>.webp (1920px, flattened on black).
window.HERO_BACKDROPS = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 27, 31, 35, 50, 52, 58, 60, 63, 64, 65, 66, 67, 69, 72, 76, 77, 79, 80, 81];
// Valve Panorama #HeroRowBackground colors, Deadlock build 6864 (2026-11-19 extract).
// Hero colors identify players and theme decoration. Match results, teams and ranks use their own palettes.
const HERO_ACCENTS = {
  "1": "#C93C26",
  "2": "#CC861E",
  "3": "#A2C7E5",
  "4": "#218440",
  "6": "#2092AE",
  "7": "#944D78",
  "8": "#23549D",
  "10": "#983952",
  "11": "#D0B945",
  "12": "#74ABBC",
  "13": "#AC6133",
  "14": "#A35A1B",
  "15": "#9F4734",
  "16": "#572798",
  "17": "#5EB083",
  "18": "#C58428",
  "19": "#E52A68",
  "20": "#9D8CA9",
  "25": "#4D68A3",
  "27": "#625789",
  "31": "#4174BB",
  "35": "#319826",
  "50": "#858617",
  "52": "#6A2E68",
  "58": "#A7AD00",
  "60": "#6B6B6B",
  "63": "#A9171E",
  "64": "#9D2C2B",
  "65": "#BD3599",
  "66": "#658B6F",
  "67": "#258F63",
  "69": "#B77528",
  "72": "#D4AD0E",
  "76": "#D9F334",
  "77": "#FF3333",
  "78": "#CE8D2A",
  "79": "#5383D1",
  "80": "#BFBC9F",
  "81": "#BBA9E1",
  "84": "#733033",
  "85": "#AA9E7E",
  "86": "#653CBC",
  "87": "#55C9BA",
  "88": "#895672"
};
const UNKNOWN_HERO_COLOR = "#EB6A6A";
const heroColor = id => Object.hasOwn(HERO_ACCENTS, id) ? HERO_ACCENTS[id] : UNKNOWN_HERO_COLOR;
// HERO_MM: hero ids with a small round minimap icon at assets/heroes_mm/<id>.png (fallback when deadlock-api is down).
window.HERO_MM = [58, 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 25, 27, 31, 35, 50, 52, 60, 63, 65, 66, 67, 69, 76, 77, 79, 80, 81];
