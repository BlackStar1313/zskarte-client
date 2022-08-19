import { Draw } from 'ol/interaction';
import { Sign } from '../core/entity/sign';
import { ZsMapBaseDrawElement } from '../map-renderer/elements/base/base-draw-element';
import { ZsMapFreehandDrawElement } from '../map-renderer/elements/freehand-draw.element';
import { ZsMapLineDrawElement } from '../map-renderer/elements/line-draw-element';
import { ZsMapPolygonDrawElement } from '../map-renderer/elements/polygon-draw-element';
import { ZsMapSymbolDrawElement } from '../map-renderer/elements/symbol-draw-element';
import { ZsMapTextDrawElement } from '../map-renderer/elements/text-draw-element';
import { ZsMapDrawElementStateType, ZsMapElementToDraw } from '../state/interfaces';
import { ZsMapStateService } from '../state/state.service';

export class DrawElementHelper {
  public static createDrawHandlerForType(element: ZsMapElementToDraw, state: ZsMapStateService): Draw {
    switch (element.type) {
      case ZsMapDrawElementStateType.TEXT:
        return ZsMapTextDrawElement.getOlDrawHandler(state, element);
      case ZsMapDrawElementStateType.POLYGON:
        return ZsMapPolygonDrawElement.getOlDrawHandler(state, element);
      case ZsMapDrawElementStateType.LINE:
        return ZsMapLineDrawElement.getOlDrawHandler(state, element);
      case ZsMapDrawElementStateType.SYMBOL:
        return ZsMapSymbolDrawElement.getOlDrawHandler(state, element);
      case ZsMapDrawElementStateType.FREEHAND:
        return ZsMapFreehandDrawElement.getOlDrawHandler(state, element);
    }
    throw new Error(`Could not create draw handler for type ${element.type}`);
  }

  public static createInstance(id: string, state: ZsMapStateService): ZsMapBaseDrawElement {
    const element = state.getDrawElementState(id);
    if (element && element.type && element.id) {
      switch (element?.type) {
        case ZsMapDrawElementStateType.TEXT:
          return new ZsMapTextDrawElement(element.id, state);
        case ZsMapDrawElementStateType.POLYGON:
          return new ZsMapPolygonDrawElement(element.id, state);
        case ZsMapDrawElementStateType.LINE:
          return new ZsMapLineDrawElement(element.id, state);
        case ZsMapDrawElementStateType.SYMBOL:
          return new ZsMapSymbolDrawElement(element.id, state);
        case ZsMapDrawElementStateType.FREEHAND:
          return new ZsMapFreehandDrawElement(element.id, state);
      }
    }

    throw new Error(`Could not create instance handler for draw element ${JSON.stringify(element)}`);
  }
}
