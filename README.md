# SEIcons.css

Inspired by Google's [Material Design Icons](https://github.com/google/material-design-icons), `SEIcons.css` is a port of the [Win98SE](https://github.com/nestoris/Win98SE) icon theme for use on the Web.

## Usage

Add a link to the stylesheet to the `<head>` of your app:

```html
<head>
    <!-- ... -->

    <link href="https://seicons.z13.web.core.windows.net/seicons.min.css" rel="stylesheet" />

     <!-- ... -->
</head>
```

Then, render an icon with the `<i>` element with the `data-seicon` attribute:

```html
<!-- ... -->

<i data-seicon="devices/computer" style="--seicon-size: 32px;"></i>

 <!-- ... -->
```

> **NOTE:** Set the size of the icon with the `--seicon-size` CSS Variable (default: `24px`).

## Previews

Icons can be previewed [here](https://seicons.z13.web.core.windows.net).

> **NOTE**: There is no lazy loading of images, this page may take a moment to load.