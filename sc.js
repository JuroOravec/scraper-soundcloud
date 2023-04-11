var config = {
  CLIENT_ID: "3jfEziDTgzNEydiG7S2Y7H9pA5sdLd16",
  BASE_URL: "https://api-v2.soundcloud.com",
  USER_TRACKS_PATH: "/users/${id}/tracks",
  MAX_LIMIT: 200,
  REQUEST_DELAY_MS: 1000,
  MIN_TRACK_COUNT: 3,
  MIN_FOLLOWERS_COUNT: 50,
  MAX_TRACK_AGE_MS: new Date().setYear(3) - new Date().setYear(0),
};

function searchParamsFromMany(...sources) {
  const sourceEntries = sources.reduce((agg, source) => {
    const entries =
      source instanceof URLSearchParams
        ? source.entries()
        : Object.entries(source);
    return [...agg, ...entries];
  }, []);
  return new URLSearchParams(sourceEntries);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serialMap(arr, func) {
  return arr.reduce(async (asyncAgg, ...args) => {
    // Wait until other requests are done.
    const agg = await asyncAgg;

    const res = await func(...args);

    return [...agg, res];
  }, []);
}

function scFetch(urlOrPath, options = {}) {
  const { params = {}, ...fetchOptions } = options;

  const defaultParams = {
    client_id: config.CLIENT_ID,
    limit: config.MAX_LIMIT,
  };

  let url;

  if (urlOrPath.startsWith("/")) {
    url = new URL(config.BASE_URL);
    url.pathname = urlOrPath;
  } else {
    url = new URL(urlOrPath);
  }

  url.search = searchParamsFromMany(url.searchParams, defaultParams, params);

  return fetch(url, fetchOptions);
}

async function scFetchAll(urlOrPath, options = {}) {
  const results = [];

  let currData = { next_href: urlOrPath, options };

  try {
    while (currData.next_href) {
      const nextData = await scFetch(currData.next_href, currData.options);
      const nextDataJson = await nextData.json();

      console.log("new data: ", nextDataJson);

      results.push(...nextDataJson.collection);

      currData = nextDataJson;

      await wait(config.REQUEST_DELAY_MS);
    }
  } catch (e) {}

  return results;
}

var users = await scFetchAll("/search/users", {
  params: {
    q: "denmark",
  },
});

var popularUsers = users.filter(
  (d) =>
    d.track_count >= config.MIN_TRACK_COUNT &&
    d.followers_count >= config.MIN_FOLLOWERS_COUNT
);

var enrichedUsers = await serialMap(popularUsers, async (user) => {
  const userTracksPath = config.USER_TRACKS_PATH.replace("${id}", user.id);
  const userTracks = await scFetchAll(userTracksPath);

  return { user, userTracks };
});

var now = new Date();
var oldestReleaseDate = new Date(now - config.MAX_TRACK_AGE_MS);

var filteredUsers = enrichedUsers.filter(({ user, userTracks }) => {
  console.log("Testing user: ", user.username);
  return userTracks.some(({ display_date, created_at }) => {
    const releaseTimestamp = display_date != null ? display_date : created_at;
    const releaseDate = new Date(releaseTimestamp);

    console.log(releaseDate, " >= ", oldestReleaseDate);
    return releaseDate.getTime() >= oldestReleaseDate.getTime();
  });
});

// If need to reimport data, uncomment following
// var fs = require('fs');
// var filteredUsers = JSON.parse(fs.readFileSync('./sc-denmark.json', 'utf-8') || '[]');

var normalizeGenre = (genre) =>
  genre
    .split(/[/\\&|]/giu)
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g != null);

var genres = filteredUsers.reduce((uniqGenres, { userTracks }) => {
  userTracks.forEach(({ genre }) => {
    if (genre == null) return;
    for (const normalizedGenre of normalizeGenre(genre)) {
      uniqGenres.add(normalizedGenre);
    }
  });
  return uniqGenres;
}, new Set());

var genreSources = (() => {
  const seenGenre = new Set();
  return filteredUsers.map(({ userTracks }) =>
    userTracks.reduce((introducedGenres, { genre }) => {
      if (genre == null) return introducedGenres;
      for (const normalizedGenre of normalizeGenre(genre)) {
        if (!seenGenre.has(normalizedGenre)) {
          seenGenre.add(normalizedGenre);
          introducedGenres.push(normalizedGenre);
        }
      }
      return introducedGenres;
    }, [])
  );
})();

var genreSourcesCounts = genreSources.map(
  (introdGenres) => introdGenres.length
);

var tracksByGenre = (() => {
  const genreTracksMap = new Map();
  for (const { userTracks } of filteredUsers) {
    for (const track of userTracks) {
      const { genre } = track;
      if (genre == null) continue;
      for (const normalizedGenre of normalizeGenre(genre)) {
        if (!genreTracksMap.has(normalizedGenre)) {
          genreTracksMap.set(normalizedGenre, []);
        }
        genreTracksMap.get(normalizedGenre).push(track);
      }
    }
  }
  return genreTracksMap;
})();

var tracksByGenreCounts = Object.fromEntries(
  Array.from(tracksByGenre.entries(), ([key, val]) => [key, val.length])
);

fs.writeFileSync(
    'sc-tracksByGenreCounts.txt',
    Object.values(tracksByGenreCounts).join('\n')
);

fs.writeFileSync(
    'sc-oneTrackGenres.txt',
    Object
        .entries(tracksByGenreCounts)
        .filter(([key, value]) => value === 1)
        .map(([k, v]) => k)
        .join('\n')
)

fs.writeFileSync(
    'sc-twoTrackGenres.txt',
    Object
        .entries(tracksByGenreCounts)
        .filter(([key, value]) => value === 2)
        .map(([k, v]) => k)
        .join('\n')
)

var allowedGenreKeywords = ['electro', 'indie', 'chill', 'drum', 'bass', 'dnb', 'synth'];

Object
  .entries(tracksByGenreCounts)
  .filter(([key, value]) => (value > 2) || allowedRareGenres.some(genre => genre.includes(key)))
  .map(([k, v]) => k)
  .join('\n')

fs.writeFileSync(
  'sc-filteredTrackGenres.txt',
  Object
    .entries(tracksByGenreCounts)
    .filter(([key, value]) => (value > 2) || allowedGenreKeywords.some(genre => genre.includes(key)))
    .map(([k, v]) => k)
    .join('\n')
);

var genreFilteredUsers = filteredUsers
  .filter(({ userTracks }) =>
    userTracks.some(track =>
      track.genre
      && allowedGenreKeywords.some(keyword => track.genre.includes(keyword))
    )
  );


fs.writeFileSync(
  'sc-denmark-genreFilteredUsers.txt',
  genreFilteredUsers
    .map(({ user }) => user.permalink_url)
    .join('\n')
);
