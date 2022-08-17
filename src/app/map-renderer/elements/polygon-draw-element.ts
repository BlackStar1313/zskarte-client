import { Feature } from 'ol';
import {
  ZsMapDrawElementStateType,
  ZsMapElementToDraw,
  ZsMapSymbolDrawElementState,
  ZsMapTextDrawElementState,
} from '../../state/interfaces';
import { ZsMapStateService } from '../../state/state.service';
import { ZsMapBaseDrawElement } from './base/base-draw-element';
import { Polygon } from 'ol/geom';
import { Type } from 'ol/geom/Geometry';
import { ZsMapOLFeatureProps } from './base/ol-feature-props';
import { checkCoordinates } from '../../helper/coordinates';

export class ZsMapPolygonDrawElement extends ZsMapBaseDrawElement<ZsMapTextDrawElementState> {
  protected _olPolygon!: Polygon;
  constructor(protected override _id: string, protected override _state: ZsMapStateService) {
    super(_id, _state);
    this._olFeature.set(ZsMapOLFeatureProps.DRAW_ELEMENT_TYPE, ZsMapDrawElementStateType.POLYGON);
    this._olFeature.set(ZsMapOLFeatureProps.DRAW_ELEMENT_ID, this._id);
    this.observeCoordinates().subscribe((coordinates) => {
      // TODO types
      if (this._olPolygon && checkCoordinates(coordinates, this._olPolygon.getCoordinates() as any)) {
        // only update coordinates if they are not matching to prevent loops
        // TODO types
        this._olPolygon?.setCoordinates(coordinates as any);
      }
    });
  }

  // TODO types
  protected _initialize(element: ZsMapSymbolDrawElementState): void {
    this._olPolygon = new Polygon(element.coordinates as number[]);
    this._olFeature.setGeometry(this._olPolygon);
    this._olFeature.set('sig', {
      type: 'Polygon',
      src: null,
      filterValue: 'not_labeled_polygon',
    });
    this._olFeature.on('change', () => {
      // TODO types
      this.setCoordinates(this._olPolygon.getCoordinates() as any);
    });
    this._isInitialized = true;
  }
  protected static override _getOlDrawType(): Type {
    return 'Polygon';
  }
  protected static override _parseFeature(feature: Feature<Polygon>, state: ZsMapStateService, element: ZsMapElementToDraw): void {
    state.addDrawElement({
      type: ZsMapDrawElementStateType.POLYGON,
      // TODO types
      coordinates: (feature.getGeometry()?.getCoordinates() as any) || [],
      layer: element.layer,
    });
  }
}
