import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

import { AboutTab } from './AboutTab';
import { AddCharacterDialog } from './AddCharacterDialog';
import { CharactersTab } from './CharactersTab';
import { NotificationBell } from './NotificationBell';
import { NotificationDrawer } from './NotificationDrawer';
import { SkillDetail } from './SkillDetail';
import { SkillPlans } from './SkillPlans';

export function TabLayout() {
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const { open, skillId, characterId, closeSkillDetail } =
    useSkillDetailStore();

  return (
    <div className="flex flex-col h-screen">
      <Tabs
        defaultValue="characters"
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <NotificationBell onOpen={() => setNotificationDrawerOpen(true)} />
            <Button onClick={() => setAddCharacterOpen(true)}>
              Add Character
            </Button>
          </div>
        </div>
        <TabsContent value="overview" className="flex-1 overflow-auto p-4">
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              Overview content coming soon...
            </p>
          </div>
        </TabsContent>
        <TabsContent value="characters" className="flex-1 overflow-hidden p-4">
          <CharactersTab />
        </TabsContent>
        <TabsContent value="plans" className="flex-1 overflow-hidden">
          <SkillPlans />
        </TabsContent>
        <TabsContent value="about" className="flex-1 overflow-auto">
          <AboutTab />
        </TabsContent>
      </Tabs>
      <AddCharacterDialog
        open={addCharacterOpen}
        onOpenChange={setAddCharacterOpen}
      />
      <NotificationDrawer
        open={notificationDrawerOpen}
        onOpenChange={setNotificationDrawerOpen}
      />
      <SkillDetail
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeSkillDetail();
          }
        }}
        skillId={skillId}
        characterId={characterId}
      />
    </div>
  );
}
