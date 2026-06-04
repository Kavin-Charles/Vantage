/* Main app — wires screen navigation, theming, and the design canvas. */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#1652F0",
  "dark": false
}/*EDITMODE-END*/;

const SCREENS = {
  home:          HomeScreen,
  pipeline:      PipelineScreen,
  activity:      ActivityScreen,
  servers:       ServersScreen,
  more:          MoreScreen,
  contacts:      ContactsScreen,
  contactDetail: ContactDetailScreen,
  deal:          DealDetailScreen,
  server:        ServerDetailScreen,
  alerts:        AlertsScreen,
  analytics:     AnalyticsScreen,
  settings:      SettingsScreen,
  tasks:         TasksScreen,
};

const TAB_SCREENS = new Set(['home', 'pipeline', 'activity', 'servers', 'more']);

const ROUTE_TAB = {
  contacts:      'more',
  contactDetail: 'more',
  deal:          'pipeline',
  server:        'servers',
  alerts:        'servers',
  analytics:     'more',
  settings:      'more',
  tasks:         'home',
};

const TABS = [
  { id: 'home',     label: 'Home',     icon: 'home' },
  { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'servers',  label: 'Servers',  icon: 'servers', dot: true },
  { id: 'more',     label: 'More',     icon: 'more' },
];

function AppCore({ platform, accent, dark }) {
  const [stack, setStack] = React.useState([{ screen: 'home', params: {} }]);
  const top = stack[stack.length - 1];

  const nav = React.useMemo(() => ({
    go: (screen, params = {}) => {
      if (TAB_SCREENS.has(screen)) {
        setStack(s => (s.length === 1 && s[0].screen === screen ? s : [{ screen, params }]));
      } else {
        setStack(s => [...s, { screen, params }]);
      }
    },
    back: () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)),
  }), []);

  const activeTab = TAB_SCREENS.has(top.screen)
    ? top.screen
    : (ROUTE_TAB[top.screen] ?? 'home');

  const ScreenComp = SCREENS[top.screen] ?? HomeScreen;

  // iOS status bar overlays the top 62px; home indicator overlays bottom 34px.
  // Android puts those in flow, so no padding needed.
  const padTop    = platform === 'ios' ? 50 : 0;
  const padBottom = platform === 'ios' ? 22 : 0;

  return (
    <ThemeCtx.Provider value={{ accent, dark, platform }}>
      <div className={'vt-mobile' + (dark ? ' vt-dark' : '')}
        style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--bg)',
          paddingTop: padTop, boxSizing: 'border-box',
        }}>
        <ScreenComp nav={nav} params={top.params ?? {}} />
        <div style={{ paddingBottom: padBottom, background: 'var(--surface)' }}>
          <TabBar active={activeTab} onTab={(id) => nav.go(id)} tabs={TABS} />
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const transparentArtboard = {
    background: 'transparent',
    boxShadow: 'none',
    borderRadius: 0,
  };

  return (
    <>
      <DesignCanvas>
        <DCSection id="phones" title="Vencore Mobile"
          subtitle="Tap into either device — both run the full clickable prototype. Bottom tabs switch sections; drill into any list row for details.">
          <DCArtboard id="ios" label="iOS · iPhone 16"
            width={402} height={874} style={transparentArtboard}>
            <IOSDevice dark={t.dark}>
              <AppCore platform="ios" accent={t.accent} dark={t.dark} />
            </IOSDevice>
          </DCArtboard>

          <DCArtboard id="android" label="Android · Pixel 9"
            width={412} height={892} style={transparentArtboard}>
            <AndroidDevice dark={t.dark}>
              <AppCore platform="android" accent={t.accent} dark={t.dark} />
            </AndroidDevice>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent}
          options={['#1652F0', '#0F1A6B', '#2A8CFF']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakToggle label="Dark mode" value={t.dark}
          onChange={(v) => setTweak('dark', v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
