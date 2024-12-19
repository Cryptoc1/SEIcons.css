export type Icon = {
    category: IconCategory;
    name: string;
    path: string;
};

export type IconCategory = 'actions' | 'animations' | 'apps' | 'categories' | 'devices' | 'emblems' | 'emotes' | 'mimes' | 'places' | 'status' | 'stock' | 'tools' | string;
export type IconManifest = Record<IconCategory, Record<string, Icon>>;