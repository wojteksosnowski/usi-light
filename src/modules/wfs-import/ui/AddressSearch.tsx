import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, MapPin } from 'lucide-react';
import { geocodeAddressDebounced, GeocodingResult } from '../services/geocoding';

interface AddressSearchProps {
  onSelect: (result: GeocodingResult) => void;
  placeholder?: string;
}

export const AddressSearch: React.FC<AddressSearchProps> = ({
  onSelect,
  placeholder = 'Wpisz adres (np. Marszałkowska 1, Warszawa)',
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const handleChange = useCallback((value: string) => {
    setQuery(value);

    if (cancelRef.current) cancelRef.current();

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    cancelRef.current = geocodeAddressDebounced(value, (result) => {
      setIsSearching(false);
      setSuggestions(result ? [result] : []);
    });
  }, []);

  const handleSelect = useCallback((result: GeocodingResult) => {
    setQuery(result.displayName.split(',').slice(0, 3).join(','));
    setSuggestions([]);
    onSelect(result);
  }, [onSelect]);

  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={14} color="var(--text-secondary)" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '7px 10px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        {isSearching && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>…</span>
        )}
      </div>

      {suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            borderRadius: '6px',
            marginTop: '4px',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSelect(s)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '11px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <MapPin size={12} color="var(--accent-blue)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.displayName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
