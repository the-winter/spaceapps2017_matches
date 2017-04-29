Running a bushfire risk simulation using satellite images.

Risk of starting->monte carlo risk of spreading

TODO:
 - uncertainty
 - elevation and slope
 - cumulative risk

data sources:
- auscover http://www.auscover.org.au/browse-all-data/
- satellite:
    - sentinel 2
    - landsat 8
        - GLCF: Landsat Tree Cover Continuous Fields https://explorer.earthengine.google.com/#detail/GLCF%2FGLS_TCC
        - Normalised Difference Vegetation Index providing a measure of vegetation density and condition. It is influenced by the fractional cover of the ground by vegetation, the vegetation density and the vegetation greenness. It indicates the photosynthetic capacity of the land surface cover.
        - EVI Enhanced vegetation index
    - slope

model:
    start at random pixel
    spread based on vegetation in nearby cells
    also die out
    in each cell remember risk of fire from all simulations

# steps
- download tifs of
    - l8
    - EVI or other veg index
    - elevation or slope
- load into js
-

# search

- A stochastic model for assessing bush fire attack on the buildings in bush fire prone areas http://mssanz.org.au/modsim09/A4/tan_z.pdf
    - no listed predictive ability
- estimate of loss http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.542.453&rep=rep1&type=pdf
