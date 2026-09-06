// Fictional memory-card contents. Icons are simple 3D-ish shapes drawn with CSS; each save has the background
// colour its own page uses, like real PS2 saves do.
export function defaultCards() {
  const mk = (id, title, shape, color, color2, bg, date, sizeKB) => ({ id, title, icon: { shape, color, color2 }, bg, date, sizeKB });
  return [
    [
      mk('BASLUS-20312', ['GRAN TURISMO 3', 'A-spec'], 'car', '#c8c8d0', '#5060a0', '#0a1e5a', '2003/07/12 21:14:08', 236),
      mk('BASLUS-20946', ['KINGDOM HEARTS', 'Traverse Town'], 'crown', '#f0c040', '#a07010', '#1b2a7a', '2003/11/02 18:03:41', 131),
      mk('BASLUS-20312-2', ['FINAL FANTASY X', 'Luca'], 'card', '#e8e8f4', '#7a86d8', '#1f2f8c', '2002/03/25 22:45:10', 63),
      mk('BASCUS-97472', ['SHADOW', 'OF THE COLOSSUS'], 'horse', '#101010', '#303030', '#0f6a1e', '2005/10/29 15:32:00', 319),
      mk('BASCUS-97199', ['Ratchet & Clank', 'Save 1'], 'wrench', '#e0b020', '#806010', '#3a1a6a', '2002/12/08 14:11:55', 78),
      mk('BASCUS-97124', ['Jak and Daxter', 'File 1'], 'orb', '#ffb830', '#ff6a00', '#c05a00', '2001/12/16 19:20:12', 92),
      mk('BASLUS-20946-3', ['SanAndreas'], 'box', '#2a2a2a', '#c0c0c0', '#2a2a2a', '2004/10/30 23:59:01', 217),
      mk('BASLUS-21059', ['TEKKEN 5'], 'star', '#e03020', '#ffd040', '#5a0a0a', '2005/03/03 20:40:22', 44),
      mk('BASLUS-20915', ['METAL GEAR SOLID 3', 'SNAKE EATER'], 'crate', '#607040', '#2e3a20', '#12200e', '2004/11/20 03:12:44', 122),
      mk('BASCUS-97113', ['ICO'], 'silhouette', '#141414', '#0a0a0a', '#1848b0', '2001/09/26 14:44:57', 354),
      mk('BASLUS-20302', ['Rez'], 'card', '#d8f0ff', '#3a80d0', '#101a5a', '2002/01/11 21:33:32', 53),
      mk('BASLUS-21115', ['OKAMI 02', '3:01:27'], 'brush', '#f0f0f0', '#d02020', '#c8a030', '2006/09/22 01:07:39', 209),
      mk('BASLUS-20949', ['Katamari Damacy', 'Game Data'], 'katamari', '#5cc85c', '#b040c0', '#0a0a0a', '2004/09/10 00:30:17', 75),
      mk('BASCUS-97399', ['God of War'], 'blade', '#c8c8c8', '#a02020', '#4a0a0a', '2005/03/26 22:18:03', 118),
      mk('BASCUS-97198', ['Sly Cooper', 'and the Thievius Raccoonus'], 'cane', '#3a6ad0', '#f0c030', '#1a2a6a', '2002/10/05 16:37:29', 62),
      mk('BASLUS-20064', ['Dark Cloud', 'Data'], 'crest', '#c0a040', '#604010', '#5a1040', '2001/07/05 14:12:02', 862),
    ],
    [
      mk('BASLUS-20302-b', ['Rez'], 'card', '#d8f0ff', '#3a80d0', '#101a5a', '2002/01/11 21:33:32', 53),
      mk('BASCUS-97472-b', ['SHADOW', 'OF THE COLOSSUS'], 'horse', '#101010', '#303030', '#0f6a1e', '2005/10/29 15:32:00', 319),
      mk('BASLUS-21376', ['Your System', 'Configuration'], 'ps2', '#2a2a30', '#5060a0', '#0a1240', '2006/04/19 15:39:03', 5),
    ],
  ];
}
