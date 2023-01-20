import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { I18NService } from '../state/i18n.service';
import { firstValueFrom, Observable, of, tap } from 'rxjs';
import { GeoFeature, GeoFeatures, GeoJSONFeature, WMTSFeature } from './entity/geoFeature';
import OlTileLayer from 'ol/layer/Tile';
import OlTileGridWMTS from 'ol/tilegrid/WMTS';
import OlTileWMTS from 'ol/source/WMTS';
import { swissProjection } from '../helper/projections';
import { bbox } from 'ol/loadingstrategy';
import { SessionService } from '../session/session.service';
import BaseLayer from 'ol/layer/Base';
import VectorSource from 'ol/source/Vector';
import { GeoJSON } from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import { StyleFunction } from 'ol/style/Style';
import { Style } from 'ol/style';
import { FeatureLike } from 'ol/Feature';
import OlStyleForPropertyValue from '../helper/getOlStyleFromLiterals';

@Injectable({
  providedIn: 'root',
})
export class GeoadminService {
  private _featuresCache: GeoFeatures | undefined;
  private _legendCache: any;

  constructor(private http: HttpClient, public i18n: I18NService, private _session: SessionService) {}

  getFeatures(): Observable<GeoFeatures> {
    if (this._featuresCache) {
      return of(this._featuresCache);
    }

    return this.http
      .get<GeoFeatures>(`https://api3.geo.admin.ch/rest/services/api/MapServer/layersConfig?lang=${this._session.getLocale()}`)
      .pipe(tap((data) => (this._featuresCache = data)));
  }

  getLegend(layerId: string): Observable<any> {
    if (this._legendCache) {
      return of(this._legendCache);
    }

    return this.http
      .get(`https://api3.geo.admin.ch/rest/services/api/MapServer/${layerId}/legend?lang=` + this._session.getLocale(), {
        responseType: 'text',
      })
      .pipe(tap((data) => (this._legendCache = data)));
  }

  queryPolygons(layerId: string, searchField: string, searchText: string): Promise<any[]> {
    return new Promise((resolve) =>
      this.http
        .get(
          `https://api3.geo.admin.ch/rest/services/api/MapServer/find?layer=${layerId}&searchField=${searchField}&searchText=${searchText}&geometryFormat=geojson&sr=3857`,
        )
        .subscribe((data) => {
          if (data && data['results']) {
            const features = [];
            for (const r of data['results']) {
              const geometry = r['geometry'];
              if (geometry['type'] && geometry['type'] === 'MultiPolygon') {
                const coordinates = geometry['coordinates'];
                const flatCoordinates = [];
                for (const polygon of coordinates) {
                  for (const polygonCoordinates of polygon) {
                    flatCoordinates.push(polygonCoordinates);
                  }
                }
                const feature = {
                  type: 'Feature',
                  geometry: { type: 'Polygon', coordinates: flatCoordinates },
                  properties: {
                    sig: {
                      type: 'Polygon',
                      src: null,
                      label: r.properties.label,
                    },
                    zindex: 0,
                  },
                };
                features.push(feature);
              }
            }
            resolve(features);
          }
        }),
    );
  }

  createGeoAdminWMTSLayer(feature: WMTSFeature): BaseLayer {
    const layerId = feature.serverLayerName;
    const timestamp = feature.timestamps[0];
    const extension = feature.format;
    const zIndex = feature.zIndex;
    return new OlTileLayer({
      source: new OlTileWMTS({
        projection: swissProjection,
        url: 'https://wmts10.geo.admin.ch/1.0.0/{Layer}/default/' + timestamp + '/2056/{TileMatrix}/{TileCol}/{TileRow}.' + extension,
        tileGrid: new OlTileGridWMTS({
          origin: [swissProjection.getExtent()[0], swissProjection.getExtent()[3]],
          resolutions: swissProjection.resolutions,
          matrixIds: swissProjection.matrixIds,
        }),
        layer: layerId,
        requestEncoding: 'REST',
        style: '',
        matrixSet: '',
      }),
      opacity: 0.6,
      zIndex: zIndex,
    });
  }

  async createGeoAdminGeoJSONLayer(feature: GeoJSONFeature): Promise<BaseLayer | undefined> {
    const styleLiterals = await firstValueFrom(this.http.get<any>(`https:${feature.styleUrl}`));
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const styles = new OlStyleForPropertyValue(styleLiterals);

    const styleFunction: StyleFunction = (f: FeatureLike, res): Style | void => {
      return styles.getFeatureStyle(f, res);
    };

    const vectorSource = new VectorSource({
      format: new GeoJSON({ featureProjection: swissProjection }),
      url: () => feature.geojsonUrl,
      strategy: bbox,
    });

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      visible: true,
      zIndex: feature.zIndex,
      opacity: 0.6,
      style: styleFunction,
    });

    return vectorLayer;
  }

  async createGeoAdminLayer(feature: GeoFeature): Promise<BaseLayer | undefined> {
    switch (feature.type) {
      case 'wmts':
        return this.createGeoAdminWMTSLayer(feature as WMTSFeature);
      case 'geojson':
        return this.createGeoAdminGeoJSONLayer(feature as GeoJSONFeature);
    }
    return undefined;
  }
}
