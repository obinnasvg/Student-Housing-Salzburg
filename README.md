# Student Housing Salzburg

An interactive map of student residences in Salzburg and the surrounding region.
Built with HTML, CSS, JavaScript and Leaflet. No backend and no build step.

## What it does

- Shows every residence in the dataset as a numbered point, clustered at low zoom
- Filters the index by name, operator, room type or locality
- Searches any place in the world through Nominatim
- Measures the straight-line distance from a residence to any point or searched place
- Reports the nearest campus and an estimated walking time for each residence
- Collects anonymous reviews, with no name, email address or IP address recorded

## Files

```
index.html              page structure; links the stylesheet and the script
css/styles.css          the complete design system, tokens at the top
js/app.js               map, index, search, distance tool, reviews
data/dorms.geojson      the dataset — 22 residences
```

## Editing the data

Each residence is one GeoJSON feature:

```json
{
  "type": "Feature",
  "properties": {
    "id": 23,
    "name": "Name of the residence",
    "operator": "Who runs it",
    "type": "Single rooms",
    "locality": "Salzburg",
    "fee_min": 400,
    "fee_max": 600,
    "eligibility": "",
    "website": "https://example.org",
    "description": "One or two sentences.",
    "photos": [],
    "reviews": []
  },
  "geometry": { "type": "Point", "coordinates": [13.0450, 47.8100] }
}
```
