// PersonalStation 2: the memory cards are the site's content. Each save is one thing Shaurya did; the "Open" option on a
// save follows its link. Bump CONTENT_VERSION when the cards change so a browser that cached the old set picks up the new.
export const CONTENT_VERSION = 5;
export const CARDS = [
  { tag: 'WORK', name: 'Work' },
  { tag: 'EDU', name: 'Education' },
  { tag: 'PROJECTS', name: 'Projects' },
  { tag: 'EXTRAS', name: 'Extras' },
];
export const RESUME_URL = 'assets/Shaurya_Resume.pdf';
export const PORTFOLIO_URL = 'assets/Shaurya_Portfolio.pdf';

// id, two-line title, icon {shape, color, color2}, page background, date stamp, size, blurb lines, stack, link
const mk = (id, title, icon, bg, date, sizeKB, desc, stack = '', link = null) => ({ id, title, icon, bg, date, sizeKB, desc, stack, link });

export function personalCards() {
  return [
    // ---- WORK ----
    [
      mk('SLES-DOMINION', ['Dominion Dynamics', 'Forward Deployed Software Engineer, 2025 – now'], { shape: 'radar', color: '#d8dee6', color2: '#3ad0ff' }, '#061a2a', '2025/06/02 08:00:00', 1536,
        ['A Canadian defence startup. I was the first engineer they hired, and I build sensing', 'systems for the Arctic, which means the code has to work somewhere very cold and very', 'far from a debugger.'],
        ''),
      mk('SLES-48HR', ['48Hour Discovery', 'ML Engineer, 2023 – 25'], { shape: 'capsule', color: '#39c6d6', color2: '#f04a6a' }, '#0a1e3a', '2023/04/03 09:00:00', 1024,
        ['Started the ML team from nothing. Now AI-designed molecules go into the lab every week,', 'and they beat the ones the experts drew. Also chewed through 5+ TB of Illumina reads', 'and built the AWS tools the lab staff actually open every day.'],
        ''),
      mk('SLES-RLAI', ['RLAI, Amii', 'Research Assistant, 2021'], { shape: 'tank', color: '#2a3a48', color2: '#8fd0ff' }, '#0b1f2e', '2021/04/26 10:30:00', 412,
        ['Taught a water treatment plant to predict itself. Q-learning and SARSA with tile coding', 'beat the fancy deep RL on sample efficiency, which nobody wanted to hear.', 'Supervisors: Martha White and Adam White.'],
        ''),
      mk('SLES-DERDA', ['Derda Lab', 'Research Assistant, 2019 – 21'], { shape: 'ring', color: '#f070c8', color2: '#60e0ff' }, '#2a0a3a', '2019/04/29 13:15:00', 640,
        ['First ML project the glycomics lab ever had: GlyNet, a network that predicts which', 'proteins stick to which sugars (R² 0.78). Still in use. Also trained a ConvNet to count', 'phage plaques on agar plates so nobody has to squint at them again.'],
        ''),
      mk('SLES-NOBES', ['Nobes Group', 'Research Assistant, 2022'], { shape: 'core', color: '#b09060', color2: '#2a1c08' }, '#2e1e08', '2022/05/09 11:00:00', 268,
        ['Rebuilt NASA’s kilowatt reactor core (KRUSTY) in SolidWorks and ran the thermal FEA.', 'Zero nuclear background on day one, a working model a few weeks later.'],
        ''),
    ],
    // ---- EDUCATION ----
    [
      mk('SLES-UOFA', ['University of Alberta', 'B.Sc. Physics, 2018 – 23'], { shape: 'mortarboard', color: '#1c2a24', color2: '#e8c34a' }, '#0a2a18', '2023/05/31 16:00:00', 780,
        ['A physics degree in Edmonton, which is mostly winter. Spent most of it in labs', 'that had nothing to do with physics, which turned out to be the point.'],
        ''),
      mk('SLES-RL1', ['Reinforcement Learning I', 'CMPUT 397, Martha White'], { shape: 'book', color: '#f0f0e8', color2: '#2a4aa8' }, '#101a48', '2020/12/18 12:00:00', 96,
        ['Bandits, MDPs, TD, tile coding, the whole first half of the book.', 'Grade: A.'],
        ''),
      mk('SLES-RL2', ['Reinforcement Learning II', 'CMPUT 609, Richard Sutton'], { shape: 'book', color: '#f0f0e8', color2: '#6a2ab0' }, '#1a0f3a', '2022/04/22 12:00:00', 128,
        ['The second half of the book, taught by the person who wrote it.', 'Grade: A-. Would take again.'],
        ''),
      mk('SLES-GLYCONET', ['GlycoNet', 'Talks & posters, 2020 – 21'], { shape: 'poster', color: '#e8e8f0', color2: '#6a4a2a' }, '#1c2440', '2021/05/20 15:00:00', 210,
        ['Presented GlyNet to a room of chemists who did not expect a physics undergrad.', 'Three research scholarships along the way.'],
        ''),
    ],
    // ---- PROJECTS ----
    [
      mk('SLES-ORDINARY', ['Ordinary App', 'iOS, 2024'], { shape: 'phone', color: '#ffd23f', color2: '#1a1a22' }, '#3a2a06', '2024/06/14 22:10:00', 512,
        ['A social app where a language model reads everyone’s description, picks the one', 'person you should message, and tells you why. 200+ people on TestFlight.', 'Messenger, invites, auth, push, location filters. All of it built by hand.'],
        'Swift, Firebase, Claude'),
      mk('SLES-PYRAMIDIFY', ['pyramidify', 'GitHub, 2022'], { shape: 'pyramid', color: '#ff6a5a', color2: '#5a1410' }, '#3a0e0a', '2022/08/05 01:12:00', 88,
        ['Plots camera poses in 3D for NeRFs. Raw photos in, a radiance field out,', 'via COLMAP and NVIDIA NGP. 17 stars. Modest fame.'],
        'COLMAP, NVIDIA NGP', 'https://github.com/shauseth/pyramidify'),
      mk('SLES-GLYNET', ['GlyNet', 'Chemical Science, 2022'], { shape: 'layers', color: '#ff8ad0', color2: '#4a1a40' }, '#2c0a24', '2022/05/12 10:00:00', 340,
        ['A multi-task neural net that predicts protein–glycan interactions from a new', 'carbohydrate fingerprint. Published in the RSC’s Chemical Science.'],
        'PyTorch, RDKit', 'https://doi.org/10.1039/D1SC05681F'),
      mk('SLES-PS2', ['PersonalStation 2', 'This website'], { shape: 'console', color: '#2c2c34', color2: '#c8c8d0' }, '#0a0e2a', '2026/09/06 15:00:00', 1998,
        ['The PS2 menu rebuilt from reference captures: boot towers, the orbs, synthesized', 'sounds, the CRT. You are standing in it right now.'],
        'three.js, Web Audio, CSS'),
      mk('SLES-PLAQUE', ['Plaque Counter', 'ConvNet, 2020'], { shape: 'petri', color: '#f2c8e0', color2: '#3ec86a' }, '#2a0820', '2020/09/03 17:40:00', 154,
        ['Hundreds of hand-labelled agar plates went into a ConvNet that now counts phage', 'plaques from a photo. Green, blue, red and white ones.'],
        'Python, OpenCV'),
    ],
    // ---- EXTRAS ----
    [
      mk('SLES-NCB', ['Nature Chemical Biology', 'Liquid glycan array, 2021'], { shape: 'paper', color: '#f0f0f0', color2: '#1e5a3a' }, '#0a2a1a', '2021/06/17 09:00:00', 220,
        ['Genetically encoded multivalent liquid glycan array displayed on M13 bacteriophage.', 'Co-author. The one with the phage.'],
        'Publication', 'https://doi.org/10.1038/s41589-021-00796-0'),
      mk('SLES-RSC', ['Chemical Science', 'GlyNet, 2022'], { shape: 'paper', color: '#f0f0f0', color2: '#5a1a48' }, '#2c0a24', '2022/05/12 09:00:00', 180,
        ['GlyNet: a multi-task neural network for predicting protein–glycan interactions.', 'Royal Society of Chemistry.'],
        'Publication', 'https://doi.org/10.1039/D1SC05681F'),
      mk('SLES-AI', ['Alberta Innovates', 'Summer Research Studentship, 2021'], { shape: 'trophy', color: '#ffd76a', color2: '#2a1a08' }, '#3a2400', '2021/05/03 09:00:00', 64,
        ['A summer of research money from the province. Spent on glycans.'],
        'Award'),
      mk('SLES-GN', ['GlycoNet Summer Award', 'Undergraduate, 2021'], { shape: 'trophy', color: '#ffd76a', color2: '#2a1a08' }, '#3a2400', '2021/05/03 09:00:00', 64,
        ['The network that funds Canadian glycomics decided to fund a bit of it.'],
        'Award'),
      mk('SLES-URI', ['URI Stipend', 'Undergraduate Research, 2020'], { shape: 'trophy', color: '#ffd76a', color2: '#2a1a08' }, '#3a2400', '2020/05/04 09:00:00', 64,
        ['Undergraduate Research Initiative stipend. The first one.'],
        'Award'),
      mk('SLES-SKILLS', ['Skills', 'Inventory'], { shape: 'toolbox', color: '#c83a2a', color2: '#3a3a3a' }, '#141a28', '2026/01/01 00:00:00', 32,
        ['Python, R, Swift, SQL.', 'PyTorch, scikit-learn, XGBoost, NumPy, Polars, RDKit.', 'Transformers, LLMs, MLPs, CNNs, SARSA, Q-learning.'],
        'Fully stocked'),
      mk('SLES-RESUME', ['Résumé', 'PDF'], { shape: 'paper', color: '#ececec', color2: '#444' }, '#1a1a20', '2026/09/06 12:00:00', 96,
        ['The one-page version. Open it, print it, staple it to something.'],
        'PDF', RESUME_URL),
      mk('SLES-PORTFOLIO', ['Portfolio', 'PDF'], { shape: 'stack', color: '#e8e8e8', color2: '#3a3a40' }, '#1a1a20', '2026/09/06 12:00:00', 1940,
        ['The version with pictures. Slides for everything on the other cards.'],
        'PDF', PORTFOLIO_URL),
      mk('SLES-GITHUB', ['GitHub', '@shauseth'], { shape: 'blocks', color: '#e6edf3', color2: '#3a4048' }, '#101418', '2026/09/06 12:00:00', 48,
        ['Code lives here.'],
        'Link', 'https://github.com/shauseth'),
      mk('SLES-LINKEDIN', ['LinkedIn', '@shauseth'], { shape: 'badge', color: '#0a66c2', color2: '#eaf2ff' }, '#08243e', '2026/09/06 12:00:00', 48,
        ['The professional one.'],
        'Link', 'https://www.linkedin.com/in/shauseth'),
      mk('SLES-EMAIL', ['Say hi', 'sseth@ualberta.ca'], { shape: 'envelope', color: '#eaf6ee', color2: '#2aa06a' }, '#062a1c', '2026/09/06 12:00:00', 16,
        ['Email is the fastest way. Open this and it drafts one for you.'],
        'Link', 'mailto:sseth@ualberta.ca'),
    ],
  ];
}
