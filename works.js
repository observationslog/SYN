/*
  作品データ一覧。
  1作品につき1つのオブジェクトを追加していく。
  image は images/ フォルダに入れたファイル名を指定する(例: images/001.jpg)。

  title      作品タイトル(任意)
  coords     [緯度, 経度]。地図上の点の位置になる。無ければ点は打たれない
  address    拡大表示のADDRESSに出る文字列(番地・都市など)
  observed   拡大表示のOBSERVEDに出る日付(ストリートビューが撮影された日付)
  generated  拡大表示のGENERATEDに出る日付(CGを作った日付)
  note       任意の一言。空文字でも可
*/

const WORKS = [
  { title: "", coords: [40.7106, -74.0089], address: "222 Broadway, New York, USA", observed: "2022.07", generated: "2025.06.02", image: "images/Zara.jpg" },
  { title: "", coords: [40.7623, -73.9740], address: "725 5th Ave, New York, USA", observed: "2022.06", generated: "2024.08.23", image: "images/TrumpTower.jpg" },
  { title: "", coords: null, address: "-", observed: "2023.11", generated: "2026.09.15", image: "images/Sink.jpg" },
  { title: "", coords: null, address: "-", observed: "-", generated: "2026.09.15", image: "images/FreightLiner.jpg" },
  { title: "", coords: [35.6812, 139.7671], address: "TOKYO, JAPAN", observed: "2023.03", generated: "2026.09.15", image: "images/Tokyo.jpg" },
  { title: "", coords: [13.6929, -89.2182], address: "49 Av Sur, SAN SALVADOR, EL SALVADOR", observed: "2025.10", generated: "2023.11.01", image: "images/ElSalvador.jpg" },
  { title: "", coords: [19.4249, -99.1652], address: "Londres, Juárez, Cuauhtémoc, CDMX, MEXICO", observed: "2024.09", generated: "2025.09.18", image: "images/Mexico.jpg" },
  { title: "", coords: [40.7614, -73.9776], address: "44 W 53rd St, New York, USA", observed: "2024.08", generated: "2026.06.16", image: "images/MoMA.jpg" },
  { title: "", coords: [17.0151, 54.0924], address: "Dhofar, SALALAH, OMAN", observed: "2024.03", generated: "2026.03.23", image: "images/Oman.jpg" },
  { title: "", coords: [13.0339, 80.2619], address: "Mylapore, Chennai, Tamil Nadu, INDIA", observed: "2025.03", generated: "2026.09.12", image: "images/India.jpg" },
  { title: "", coords: [18.7969, 98.9678], address: "Nimmanhaemin, Mueang Chiang Mai, THAI", observed: "2023.03", generated: "2024.09.03", image: "images/Thai.jpg" },
  { title: "", coords: [40.7093, -74.0166], address: "397 S End Ave, New York, USA", observed: "2021.05", generated: "2023.11.29", image: "images/NV200.jpg" },
  { title: "", coords: [-30.4231, -64.3616], address: "Italia 160, Dean Funes, Córdoba, ARGENTINA", observed: "2024.11", generated: "2026.04.08", image: "images/Argentina.jpg" },
];
