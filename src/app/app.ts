import { Component, inject } from '@angular/core';
import { JsonPipe } from '@angular/common';

import { KjvDataService } from './services/kjv-data.service';

@Component({
  selector: 'kjv-root',
  imports: [JsonPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly kjvDataService = inject(KjvDataService);
}
