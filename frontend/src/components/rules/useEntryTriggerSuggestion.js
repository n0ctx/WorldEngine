import { useEffect, useState } from 'react';
import { suggestTrigger } from '../../core/utils/trigger-suggestion.js';

export default function useEntryTriggerSuggestion(content, triggerType, properNouns, stateFieldLabels) {
  const [suggestion, setSuggestion] = useState(null);
  const [dismissedFor, setDismissedFor] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const result = suggestTrigger(content, { properNouns, stateFieldLabels });
      if (!result || result.trigger_type === triggerType || content === dismissedFor) {
        setSuggestion(null);
        return;
      }
      setSuggestion(result);
    }, 400);
    return () => clearTimeout(timer);
  }, [content, triggerType, properNouns, stateFieldLabels, dismissedFor]);

  return { suggestion, setSuggestion, setDismissedFor };
}
