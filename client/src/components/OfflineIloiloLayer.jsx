import { CircleMarker, Pane, Polygon, Polyline, Tooltip } from 'react-leaflet';
import { ILOILO_MAX_BOUNDS } from '../utils/iloiloMap.js';

// A small, locally rendered regional guide map sits beneath live map tiles.
// Coordinates are deliberately schematic but remain geographically bounded
// to Iloilo Province, so the map still has useful context when tiles are down.
const [[south, west], [north, east]] = ILOILO_MAX_BOUNDS;
const point = ([x, y]) => [north - (y / 900) * (north - south), west + (x / 1200) * (east - west)];
const path = points => points.map(point);

const coastline = [
  [1200, 20], [1125, 58], [1071, 86], [1015, 122], [965, 155], [936, 187],
  [900, 216], [867, 242], [855, 273], [831, 301], [809, 327], [804, 359],
  [781, 389], [754, 424], [743, 454], [719, 486], [697, 516], [691, 550],
  [664, 582], [641, 610], [625, 640], [612, 671], [597, 708], [588, 746],
  [568, 779], [545, 817], [525, 855], [512, 900],
];

const mainRoads = [
  [[171, 641], [285, 612], [351, 589], [431, 556], [510, 523], [575, 476], [646, 417], [701, 372], [742, 319], [792, 257], [828, 211], [862, 174], [907, 144]],
  [[445, 556], [440, 501], [430, 448], [417, 397], [407, 358], [399, 319], [382, 272], [368, 231], [352, 188], [339, 142]],
  [[441, 557], [373, 570], [318, 589], [250, 608], [193, 624], [135, 641], [82, 660]],
  [[351, 586], [342, 539], [328, 501], [302, 462], [281, 430], [253, 401], [221, 372]],
  [[412, 401], [459, 390], [503, 385], [547, 395], [580, 402], [609, 410], [646, 417]],
  [[383, 274], [442, 252], [496, 232], [552, 213], [603, 196], [653, 180], [709, 167]],
];

const rivers = [
  [[792, 156], [760, 214], [767, 260], [724, 302], [691, 334], [701, 370], [671, 411], [646, 444], [654, 481], [623, 518], [591, 557], [602, 594], [566, 634]],
  [[625, 466], [565, 448], [519, 460], [472, 435], [427, 411], [396, 420], [355, 396]],
  [[687, 333], [633, 321], [605, 297], [564, 280]],
];

const places = [
  ['Iloilo City', [445, 556]], ['Pavia', [421, 526]], ['Santa Barbara', [419, 502]],
  ['Leganes', [470, 532]], ['Zarraga', [495, 515]], ['Oton', [339, 581]],
  ['Cabatuan', [383, 397]], ['Miagao', [350, 465]], ['Pototan', [390, 317]],
  ['Passi City', [470, 220]], ['Jordan · Guimaras', [480, 728]],
];

const guimaras = [[445, 668], [474, 644], [517, 650], [535, 680], [548, 704], [540, 731], [521, 752], [504, 774], [480, 798], [453, 793], [427, 789], [411, 764], [414, 737], [416, 710], [425, 686]];

export default function OfflineIloiloLayer() {
  return (
    <Pane name="offlineIloiloBase" style={{ zIndex: 199, pointerEvents: 'none' }}>
      <Polygon
        positions={[point([0, 0]), point([1200, 0]), ...path(coastline), point([0, 900])]}
        pathOptions={{ color: '#bdcbb8', weight: 1, fillColor: '#edf2e9', fillOpacity: 1, interactive: false }}
        interactive={false}
      />
      <Polygon
        positions={path(guimaras)}
        pathOptions={{ color: '#c8d3c0', weight: 1, fillColor: '#e7eddf', fillOpacity: 1, interactive: false }}
        interactive={false}
      />
      {rivers.map((river, index) => (
        <Polyline key={`river-${index}`} positions={path(river)} pathOptions={{ color: '#9fc4cf', weight: 2.5, opacity: 0.9 }} interactive={false} />
      ))}
      {mainRoads.map((road, index) => (
        <Polyline key={`road-casing-${index}`} positions={path(road)} pathOptions={{ color: '#fffdf5', weight: index < 3 ? 7 : 5, opacity: 0.98 }} interactive={false} />
      ))}
      {mainRoads.map((road, index) => (
        <Polyline key={`road-${index}`} positions={path(road)} pathOptions={{ color: index < 3 ? '#d4a86a' : '#d9c8a9', weight: index < 3 ? 2.5 : 1.5, opacity: 0.95 }} interactive={false} />
      ))}
      {places.map(([name, xy]) => (
        <CircleMarker key={name} center={point(xy)} radius={3.5} pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: '#15803D', fillOpacity: 1 }} interactive={false}>
          <Tooltip permanent direction="right" offset={[5, 0]} pane="offlineIloiloBase" className="offline-map-label">{name}</Tooltip>
        </CircleMarker>
      ))}
    </Pane>
  );
}
