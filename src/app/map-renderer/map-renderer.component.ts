import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Draw, Select, Translate, defaults, Modify } from 'ol/interaction';
import OlMap from 'ol/Map';
import OlView from 'ol/View';
import OlTileLayer from 'ol/layer/Tile';
import OlTileWMTS from 'ol/source/WMTS';
import { Subject, takeUntil } from 'rxjs';
import { ZsMapBaseDrawElement } from './elements/base/base-draw-element';
import { ZsMapOLFeatureProps } from './elements/base/ol-feature-props';
import { areArraysEqual } from '../helper/array';
import { DrawElementHelper } from '../helper/draw-element-helper';
import { ZsMapBaseLayer } from './layers/base-layer';
import { ZsMapSources } from '../state/map-sources';
import { ZsMapStateService } from '../state/state.service';
import { debounce } from '../helper/debounce';
import { I18NService } from '../state/i18n.service';
import { SidebarContext } from '../state/interfaces';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Collection, Feature } from 'ol';
import { Point } from 'ol/geom';
import { Icon, Style } from 'ol/style';
import { GeoadminService } from '../core/geoadmin.service';
import { DrawStyle } from './draw-style';

@Component({
  selector: 'app-map-renderer',
  templateUrl: './map-renderer.component.html',
  styleUrls: ['./map-renderer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapRendererComponent implements AfterViewInit {
  @ViewChild('mapElement') mapElement!: ElementRef;

  sidebarContext = SidebarContext;

  private _ngUnsubscribe = new Subject<void>();
  private _map!: OlMap;
  private _view!: OlView;
  private _mapLayer = new OlTileLayer({
    zIndex: 0,
  });
  private _navigationLayer!: VectorLayer<VectorSource>;
  private _positionFlag!: Feature;
  private _positionFlagLocation!: Point;
  private _layerCache: Record<string, ZsMapBaseLayer> = {};
  private _drawElementCache: Record<string, { layer: string | undefined; element: ZsMapBaseDrawElement }> = {};
  private _currentDrawInteraction: Draw | undefined;
  private _featureLayerCache: Map<string, OlTileLayer<OlTileWMTS>> = new Map();
  private _modifyCache = new Collection<Feature>([]);

  constructor(private _state: ZsMapStateService, public i18n: I18NService, private geoAdminService: GeoadminService) {}

  public ngOnDestroy(): void {
    this._ngUnsubscribe.next();
    this._ngUnsubscribe.complete();
  }

  public ngAfterViewInit(): void {
    // TODO
    const select = new Select({
      hitTolerance: 10,
      style: (feature, resolution) => {
        return DrawStyle.styleFunctionSelect(feature, resolution, true);
      },
    });
    select.on('select', (event) => {
      this._modifyCache.clear();
      for (const feature of event.selected) {
        this._modifyCache.push(feature);
        console.log('selected element', {
          isDrawElement: feature.get(ZsMapOLFeatureProps.IS_DRAW_ELEMENT),
          type: feature.get(ZsMapOLFeatureProps.DRAW_ELEMENT_TYPE),
          id: feature.get(ZsMapOLFeatureProps.DRAW_ELEMENT_ID),
        });
        // TODO write to display state selectedDrawElements
      }
    });

    const modify = new Modify({
      features: this._modifyCache,
      condition: () => {
        if (modify['vertexFeature_'] && modify['lastPointerEvent_'] && this.areFeaturesModifiable()) {
          // todo toggle edit buttons
          return true;
        }
        return false;
      },
    });

    // TODO
    const translate = new Translate({
      features: select.getFeatures(),
    });

    this._view = new OlView({
      center: [849861.97, 5905812.55], // TODO get from newly implemented session
      zoom: 16, // TODO get from newly implemented session
    });

    this._map = new OlMap({
      target: this.mapElement.nativeElement,
      view: this._view,
      controls: [],
      interactions: defaults({
        doubleClickZoom: false,
        pinchRotate: false,
        shiftDragZoom: false,
      }).extend([select, translate, modify]),
    });

    this._positionFlagLocation = new Point([0, 0]);
    this._positionFlag = new Feature({
      geometry: this._positionFlagLocation,
    });

    this._positionFlag.setStyle(
      new Style({
        image: new Icon({
          anchor: [0.5, 1],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          src: 'assets/img/place.png',
          scale: 0.15,
        }),
      }),
    );

    const navigationSource = new VectorSource({
      features: [this._positionFlag],
    });
    this._navigationLayer = new VectorLayer({
      source: navigationSource,
    });
    this._navigationLayer.setZIndex(99999999999);
    this._map.addLayer(this._navigationLayer);

    this._map.on('moveend', () => {
      this._state.setMapCenter(this._view.getCenter() || [0, 0]);
    });

    const debouncedZoomSave = debounce(() => {
      this._state.setMapZoom(this._view.getZoom() || 10);
    }, 1000);

    this._view.on('change:resolution', () => {
      debouncedZoomSave();
    });

    this._state.observeMapCenter().subscribe((center) => {
      if (!areArraysEqual(this._view.getCenter() || [0, 0], center)) {
        // TODO implement proper fallback center
        if (!center[0] && !center[1]) {
          center = [849861.97, 5905812.55];
        }
        this._view.setCenter(center);
      }
    });

    this._state.observeMapZoom().subscribe((zoom) => {
      if (this._view.getZoom() !== zoom) {
        // TODO implement proper fallback zoom
        if (!zoom) {
          zoom = 16;
        }
        this._view.setZoom(zoom);
      }
    });

    this._map.addLayer(this._mapLayer);

    this._state.observeElementToDraw().subscribe((element) => {
      if (element) {
        const interaction = DrawElementHelper.createDrawHandlerForType(element, this._state);
        interaction.on('drawend', () => {
          this._state.cancelDrawing();
        });
        this._currentDrawInteraction = interaction;
        this._map.addInteraction(this._currentDrawInteraction);
      } else {
        if (this._currentDrawInteraction) {
          this._map.removeInteraction(this._currentDrawInteraction);
        }
        this._currentDrawInteraction = undefined;
      }
    });

    this._state
      .observeMapSource()
      .pipe(takeUntil(this._ngUnsubscribe))
      .subscribe((source) => {
        this._mapLayer.setSource(ZsMapSources.get(source));
      });

    this._state
      .observeMapOpacity()
      .pipe(takeUntil(this._ngUnsubscribe))
      .subscribe((opacity) => {
        this._mapLayer.setOpacity(opacity);
      });

    this._state
      .observeLayers()
      .pipe(takeUntil(this._ngUnsubscribe))
      .subscribe((layers) => {
        for (const layer of layers) {
          if (!this._layerCache[layer.getId()]) {
            this._layerCache[layer.getId()] = layer;
            this._map.addLayer(layer.getOlLayer());
          }
        }
      });

    this._state
      .observeDrawElements()
      .pipe(takeUntil(this._ngUnsubscribe))
      .subscribe((elements) => {
        for (const element of elements) {
          if (!this._drawElementCache[element.getId()]) {
            this._drawElementCache[element.getId()] = {
              element,
              layer: undefined,
            };
            // TODO unsubscribing
            element.observeLayer().subscribe((layer) => {
              const cache = this._drawElementCache[element.getId()];
              const feature = element.getOlFeature();
              if (cache.layer) {
                const cachedLayer = this._state.getLayer(cache.layer);
                if (cachedLayer) {
                  cachedLayer.removeOlFeature(feature);
                }
              }
              cache.layer = layer;
              const newLayer = this._state.getLayer(layer || '');
              newLayer?.addOlFeature(feature);
            });
          }
        }
      });

    this._state
      .observeSelectedFeatures()
      .pipe(takeUntil(this._ngUnsubscribe))
      .subscribe((features) => {
        // removed features
        const cacheNames = Array.from(this._featureLayerCache.keys());
        features
          .filter((el) => !cacheNames.includes(el.serverLayerName))
          .forEach((feature) => {
            const layer = this.geoAdminService.createGeoAdminLayer(
              feature.serverLayerName,
              feature.timestamps[0],
              feature.format,
              feature.zIndex,
            );
            this._map.addLayer(layer);
            this._featureLayerCache.set(feature.serverLayerName, layer);

            // observe feature changes
            this._state.observeFeature(feature.serverLayerName).subscribe({
              next: (updatedFeature) => {
                if (updatedFeature) {
                  layer.setZIndex(updatedFeature.zIndex);
                  layer.setOpacity(updatedFeature.opacity);
                }
              },
              complete: () => {
                this._map.removeLayer(layer);
                this._featureLayerCache.delete(feature.serverLayerName);
              },
            });
          });
      });

    this._state.observePositionFlag().subscribe((positionFlag) => {
      this._navigationLayer.setVisible(positionFlag.isVisible);
      this._positionFlagLocation.setCoordinates(positionFlag.coordinates);
      this._positionFlag.changed();
    });
  }

  areFeaturesModifiable() {
    return this._modifyCache.getArray()
      .every((feature) => feature && feature.get('sig') && !feature.get('sig').protected)
  }

  zoomIn() {
    this._state.updateMapZoom(1);
  }

  zoomOut() {
    this._state.updateMapZoom(-1);
  }

  setSidebarContext(context: SidebarContext) {
    this._state.toggleSidebarContext(context);
  }
}
