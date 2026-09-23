import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiveTrainsPanel from './LiveTrainsPanel';

// Mock WebSocket implementation
class MockWebSocket {
  constructor(url) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send = vi.fn();
  close = vi.fn();
}
MockWebSocket.instances = [];

vi.mock('../api/client', () => ({
  WS_URL: 'ws://localhost:8000',
}));

vi.mock('./RailTracker', () => ({
  default: ({ trainNumber, searchFrom, searchTo }) => (
    <div data-testid="rail-tracker">
      Tracker for {trainNumber} ({searchFrom || 'N/A'} to {searchTo || 'N/A'})
    </div>
  ),
}));

describe('LiveTrainsPanel', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    global.WebSocket = MockWebSocket;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null if sectionId is missing', () => {
    const { container } = render(<LiveTrainsPanel sectionId="" />);
    expect(container.firstChild).toBeNull();
  });

  it('connects to WebSocket and reflects streaming state', () => {
    render(<LiveTrainsPanel sectionId="sec-101" trackCode="TR-A" />);
    
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain('section_id=sec-101');
    expect(screen.getByText('CONNECTING…')).toBeInTheDocument();

    act(() => {
      MockWebSocket.instances[0].onopen();
    });
    expect(screen.getByText('STREAMING')).toBeInTheDocument();
  });

  it('renders train list and data source badge upon receiving message', () => {
    render(<LiveTrainsPanel sectionId="sec-101" />);

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          data_source: 'REAL_API',
          trains: [
            {
              train_number: '12345',
              train_name: 'Express Alpha',
              status: 'DELAYED',
              train_type: 'EXPRESS',
              origin: 'DEL',
              destination: 'MUM',
              departure_time: '10:00',
              arrival_time: '20:00',
              delay_minutes: 20,
            },
          ],
        }),
      });
    });

    expect(screen.getByText('LIVE API')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('Express Alpha')).toBeInTheDocument();
    expect(screen.getByText('DELAYED')).toBeInTheDocument();
  });

  it('selects a train and renders RailTracker inspector', () => {
    render(<LiveTrainsPanel sectionId="sec-101" searchFrom="DEL" searchTo="MUM" />);

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          data_source: 'SIMULATED DATA',
          trains: [
            {
              train_number: '99999',
              train_name: 'Test Runner',
              status: 'RUNNING',
            },
          ],
        }),
      });
    });

    // Find and click the train card
    const trainText = screen.getByText('99999');
    fireEvent.click(trainText.closest('div.cursor-pointer'));

    expect(screen.getByTestId('rail-tracker')).toHaveTextContent('Tracker for 99999 (DEL to MUM)');
    expect(screen.getByText(/Detailed Telemetry Inspector — Train #99999/i)).toBeInTheDocument();
  });

  it('toggles raw JSON payload visibility', () => {
    render(<LiveTrainsPanel sectionId="sec-101" />);
    
    const toggleButton = screen.getByText('Show Raw JSON');
    fireEvent.click(toggleButton);
    
    expect(screen.getByText('Hide Raw JSON')).toBeInTheDocument();
  });
});