'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';

// Whiteboard context state interface
interface WhiteboardState {
  whiteboardId: string;
  workspaceId: string;
  isReadOnly: boolean;
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
  canvasData: any | null;
  selectedElements: string[];
  viewportBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  } | null;
  collaborators: Array<{
    userId: string;
    userName: string;
    cursor?: { x: number; y: number };
    selection?: string[];
  }>;
}

// Action types for state management
type WhiteboardAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CANVAS_DATA'; payload: any }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'SET_SELECTED_ELEMENTS'; payload: string[] }
  | { type: 'SET_VIEWPORT_BOUNDS'; payload: WhiteboardState['viewportBounds'] }
  | { type: 'UPDATE_COLLABORATORS'; payload: WhiteboardState['collaborators'] }
  | { type: 'RESET_STATE' };

// Context interface
interface WhiteboardContextType {
  state: WhiteboardState;
  actions: {
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    setError: (error: string | null) => void;
    setCanvasData: (data: any) => void;
    setLastSaved: (date: Date) => void;
    setSelectedElements: (elements: string[]) => void;
    setViewportBounds: (bounds: WhiteboardState['viewportBounds']) => void;
    updateCollaborators: (collaborators: WhiteboardState['collaborators']) => void;
    resetState: () => void;
  };
}

// Initial state
const createInitialState = (
  whiteboardId: string,
  workspaceId: string,
  isReadOnly: boolean
): WhiteboardState => ({
  whiteboardId,
  workspaceId,
  isReadOnly,
  isLoading: false,
  isSaving: false,
  lastSaved: null,
  error: null,
  canvasData: null,
  selectedElements: [],
  viewportBounds: null,
  collaborators: [],
});

// Reducer function
const whiteboardReducer = (state: WhiteboardState, action: WhiteboardAction): WhiteboardState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_CANVAS_DATA':
      return { ...state, canvasData: action.payload };
    
    case 'SET_LAST_SAVED':
      return { ...state, lastSaved: action.payload };
    
    case 'SET_SELECTED_ELEMENTS':
      return { ...state, selectedElements: action.payload };
    
    case 'SET_VIEWPORT_BOUNDS':
      return { ...state, viewportBounds: action.payload };
    
    case 'UPDATE_COLLABORATORS':
      return { ...state, collaborators: action.payload };
    
    case 'RESET_STATE':
      return createInitialState(state.whiteboardId, state.workspaceId, state.isReadOnly);
    
    default:
      return state;
  }
};

// Create context
const WhiteboardContext = createContext<WhiteboardContextType | null>(null);

// Provider props
interface WhiteboardProviderProps {
  whiteboardId: string;
  workspaceId: string;
  isReadOnly?: boolean;
  children: ReactNode;
}

// Provider component
export const WhiteboardProvider: React.FC<WhiteboardProviderProps> = ({
  whiteboardId,
  workspaceId,
  isReadOnly = false,
  children,
}) => {
  const { toast } = useToast();
  const [state, dispatch] = useReducer(
    whiteboardReducer,
    createInitialState(whiteboardId, workspaceId, isReadOnly)
  );

  // Action creators
  const actions = {
    setLoading: (loading: boolean) => {
      dispatch({ type: 'SET_LOADING', payload: loading });
    },

    setSaving: (saving: boolean) => {
      dispatch({ type: 'SET_SAVING', payload: saving });
    },

    setError: (error: string | null) => {
      dispatch({ type: 'SET_ERROR', payload: error });
      
      // Show error toast
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Whiteboard Error',
          description: error,
        });
      }
    },

    setCanvasData: (data: any) => {
      dispatch({ type: 'SET_CANVAS_DATA', payload: data });
    },

    setLastSaved: (date: Date) => {
      dispatch({ type: 'SET_LAST_SAVED', payload: date });
    },

    setSelectedElements: (elements: string[]) => {
      dispatch({ type: 'SET_SELECTED_ELEMENTS', payload: elements });
    },

    setViewportBounds: (bounds: WhiteboardState['viewportBounds']) => {
      dispatch({ type: 'SET_VIEWPORT_BOUNDS', payload: bounds });
    },

    updateCollaborators: (collaborators: WhiteboardState['collaborators']) => {
      dispatch({ type: 'UPDATE_COLLABORATORS', payload: collaborators });
    },

    resetState: () => {
      dispatch({ type: 'RESET_STATE' });
    },
  };

  // Effect to handle state changes and side effects
  useEffect(() => {
    // Handle successful save
    if (state.lastSaved && !state.isSaving && !state.error) {
      const timeSinceLastSave = Date.now() - state.lastSaved.getTime();
      
      // Only show toast for saves within the last 5 seconds
      if (timeSinceLastSave < 5000) {
        toast({
          title: 'Canvas Saved',
          description: 'Your changes have been saved automatically',
        });
      }
    }
  }, [state.lastSaved, state.isSaving, state.error, toast]);

  // Effect to handle error recovery
  useEffect(() => {
    if (state.error) {
      // Auto-clear error after 10 seconds
      const timer = setTimeout(() => {
        actions.setError(null);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [state.error]);

  const contextValue: WhiteboardContextType = {
    state,
    actions,
  };

  return (
    <WhiteboardContext.Provider value={contextValue}>
      {children}
    </WhiteboardContext.Provider>
  );
};

// Custom hook to use whiteboard context
export const useWhiteboardContext = (): WhiteboardContextType => {
  const context = useContext(WhiteboardContext);
  
  if (!context) {
    throw new Error('useWhiteboardContext must be used within a WhiteboardProvider');
  }
  
  return context;
};

// Selector hooks for specific state slices
export const useWhiteboardState = () => {
  const { state } = useWhiteboardContext();
  return state;
};

export const useWhiteboardActions = () => {
  const { actions } = useWhiteboardContext();
  return actions;
};

export const useWhiteboardSelection = () => {
  const { state } = useWhiteboardContext();
  return {
    selectedElements: state.selectedElements,
    hasSelection: state.selectedElements.length > 0,
  };
};

export const useWhiteboardStatus = () => {
  const { state } = useWhiteboardContext();
  return {
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    error: state.error,
    lastSaved: state.lastSaved,
    isReadOnly: state.isReadOnly,
  };
};

export const useWhiteboardCollaboration = () => {
  const { state, actions } = useWhiteboardContext();
  return {
    collaborators: state.collaborators,
    updateCollaborators: actions.updateCollaborators,
  };
};